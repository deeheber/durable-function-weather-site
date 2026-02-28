#!/usr/bin/env node
import 'dotenv/config'

import { App } from 'aws-cdk-lib'

import { DurableWeatherStack } from '../lib/durable-weather-stack'

const {
  AWS_DEFAULT_ACCOUNT_ID,
  AWS_DEFAULT_REGION,
  CDK_DEFAULT_ACCOUNT,
  CDK_DEFAULT_REGION,
  LOCATION_NAME: locationName = '',
  OPEN_WEATHER_URL: openWeatherUrl = '',
  SCHEDULES: schedules = 'rate(10 minutes)',
  STACK_PREFIX: stackPrefix = 'myDurableStack',
  WEATHER_LOCATION_LAT: weatherLocationLat = '',
  WEATHER_LOCATION_LON: weatherLocationLon = '',
  WEATHER_TYPE: weatherType = 'snow',
} = process.env

const account = CDK_DEFAULT_ACCOUNT || AWS_DEFAULT_ACCOUNT_ID
const region = CDK_DEFAULT_REGION || AWS_DEFAULT_REGION

if (
  ![locationName, openWeatherUrl, weatherLocationLat, weatherLocationLon].every(
    (el) => !!el,
  )
) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        locationName,
        openWeatherUrl,
        weatherLocationLat,
        weatherLocationLon,
      },
      null,
      2,
    ),
  )
  throw new Error('Missing environment variables!')
}

const app = new App()

new DurableWeatherStack(app, `${stackPrefix}-weather`, {
  description: `Resources for ${stackPrefix}-weather, a durable function weather website`,
  env: { account, region },
  locationName,
  openWeatherUrl,
  schedules: schedules.split(', '),
  weatherLocationLat,
  weatherLocationLon,
  weatherType,
})
