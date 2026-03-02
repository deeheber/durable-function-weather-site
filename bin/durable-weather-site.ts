#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { z } from 'zod'

import { DurableWeatherStack } from '../lib/durable-weather-stack'

const envSchema = z
  .object({
    CDK_DEFAULT_ACCOUNT: z.string().optional(),
    AWS_DEFAULT_ACCOUNT_ID: z.string().optional(),
    CDK_DEFAULT_REGION: z.string().optional(),
    AWS_DEFAULT_REGION: z.string().optional(),
    LOCATION_NAME: z.string().min(1),
    OPEN_WEATHER_URL: z.url(),
    SCHEDULES: z.string().default('rate(60 minutes)'),
    STACK_PREFIX: z.string().default('myDurableStack'),
    WEATHER_LOCATION_LAT: z.string().min(1),
    WEATHER_LOCATION_LON: z.string().min(1),
    WEATHER_TYPE: z.string().default('snow'),
  })
  .refine((env) => env.CDK_DEFAULT_ACCOUNT || env.AWS_DEFAULT_ACCOUNT_ID, {
    message:
      'AWS account not found. Configure AWS CLI credentials or set AWS_DEFAULT_ACCOUNT_ID.',
  })
  .refine((env) => env.CDK_DEFAULT_REGION || env.AWS_DEFAULT_REGION, {
    message:
      'AWS region not found. Configure AWS CLI credentials or set AWS_DEFAULT_REGION.',
  })

const env = envSchema.parse(process.env)

const account = (env.CDK_DEFAULT_ACCOUNT || env.AWS_DEFAULT_ACCOUNT_ID)!
const region = (env.CDK_DEFAULT_REGION || env.AWS_DEFAULT_REGION)!

const app = new App()

new DurableWeatherStack(app, `${env.STACK_PREFIX}-weather`, {
  description: `Resources for ${env.STACK_PREFIX}-weather, a durable function weather website`,
  env: { account, region },
  locationName: env.LOCATION_NAME,
  openWeatherUrl: env.OPEN_WEATHER_URL,
  schedules: env.SCHEDULES.split(', '),
  weatherLocationLat: env.WEATHER_LOCATION_LAT,
  weatherLocationLon: env.WEATHER_LOCATION_LON,
  weatherType: env.WEATHER_TYPE,
})
