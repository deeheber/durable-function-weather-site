import {
  DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js'
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm'
import { Buffer } from 'buffer'

const ssm = new SSMClient({})
const secretsManager = new SecretsManagerClient({})
const s3 = new S3Client({})
const cloudfront = new CloudFrontClient({})

export const handler = withDurableExecution(
  async (_event: unknown, context: DurableContext) => {
    const siteStatus = await context.step('get-site-status', async () => {
      const result = await ssm.send(
        new GetParameterCommand({
          Name: process.env.SSM_PARAM_NAME!,
        }),
      )
      return result.Parameter!.Value!
    })

    const apiKey = await context.step('get-api-key', async () => {
      const result = await secretsManager.send(
        new GetSecretValueCommand({
          SecretId: 'weather-site-api-key',
        }),
      )
      return result.SecretString!
    })

    const currentWeather = await context.step(
      'get-weather',
      async () => {
        const weatherType = process.env.WEATHER_TYPE!.toLowerCase()
        const lat = process.env.WEATHER_LOCATION_LAT!
        const lon = process.env.WEATHER_LOCATION_LON!

        const url = `https://api.openweathermap.org/data/3.0/onecall?units=imperial&exclude=minutely,hourly,daily,alerts&lat=${lat}&lon=${lon}&appid=${apiKey}`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`Weather API error: ${response.status}`)
        }

        const data = (await response.json()) as {
          current: { weather: { main: string }[] }
        }
        const weatherMain = data.current.weather[0].main.toLowerCase()

        return weatherMain.includes(weatherType)
          ? weatherType
          : `no ${weatherType}`
      },
      {
        retryStrategy: (error: Error, attemptCount: number) => {
          if (attemptCount >= 3) return { shouldRetry: false }
          const delay = Math.min(2 * Math.pow(2, attemptCount - 1), 30)
          return { shouldRetry: true, delay: { seconds: delay } }
        },
      },
    )

    if (currentWeather === siteStatus) {
      return { status: currentWeather, updated: false }
    }

    await context.step('update-site', async () => {
      const weatherType = process.env.WEATHER_TYPE!
      let weather = weatherType
      if (
        weather.toLowerCase().endsWith('e') ||
        weather.toLowerCase().endsWith('s')
      ) {
        // Remove the last letter so adding 'ing' will work
        // Examples: 'haze' -> 'haz' -> 'hazing', 'clouds' -> 'cloud' -> 'clouding'
        weather = weather.slice(0, -1)
      }

      const answerText = currentWeather.startsWith('no') ? 'NO.' : 'YES!!!'
      const backgroundColor = currentWeather.startsWith('no') ? 'green' : 'red'

      const htmlString = `<html>
  <head>
    <link rel="stylesheet" type="text/css" href="styles.css">
    <title>Is it ${weather}ing in ${process.env.LOCATION_NAME}?</title>
  </head>
  <body style="background-color: ${backgroundColor};">
    <div class="supercontainer">
      <div class="container">
        <div class="title">
          <h1>${answerText}</h1>
        </div>
        <div class="footer">
          <p>
            This site uses a weather API, so if you're wondering why it's not matching what you're seeing check <a href="${process.env.OPEN_WEATHER_URL}">here</a>
          </p>
          <p>
            Made by <a href="https://www.danielleheberling.xyz/">Danielle Heberling</a> - Inspired by <a href="http://isitsnowinginpdx.com/">Is it snowing in PDX</a>
          </p>
          <p>
            <a href="https://github.com/deeheber/durable-function-weather-site">Code contributions welcome</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME!,
          Key: 'index.html',
          Body: Buffer.from(htmlString),
          ContentType: 'text/html',
        }),
      )
    })

    await context.parallel('finish-update', [
      async (ctx: DurableContext) => {
        await ctx.step('update-ssm', async () => {
          await ssm.send(
            new PutParameterCommand({
              Name: process.env.SSM_PARAM_NAME!,
              Value: currentWeather,
              Overwrite: true,
            }),
          )
        })
      },
      async (ctx: DurableContext) => {
        await ctx.step('invalidate-cf', async () => {
          await cloudfront.send(
            new CreateInvalidationCommand({
              DistributionId: process.env.DISTRIBUTION_ID!,
              InvalidationBatch: {
                CallerReference: new Date().toISOString(),
                Paths: {
                  Quantity: 1,
                  Items: ['/index.html'],
                },
              },
            }),
          )
        })
      },
    ])

    return { status: currentWeather, updated: true }
  },
)
