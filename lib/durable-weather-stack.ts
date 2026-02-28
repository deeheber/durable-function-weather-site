import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  TimeZone,
} from 'aws-cdk-lib'
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import {
  Architecture,
  LoggingFormat,
  Runtime,
  Tracing,
} from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler'
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets'
import { Queue } from 'aws-cdk-lib/aws-sqs'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import * as path from 'path'

interface DurableWeatherStackProps extends StackProps {
  locationName: string
  openWeatherUrl: string
  schedules: string[]
  weatherLocationLat: string
  weatherLocationLon: string
  weatherType: string
}

export class DurableWeatherStack extends Stack {
  public id: string
  private props: DurableWeatherStackProps
  private distribution: Distribution
  private bucket: Bucket
  private durableFunction: NodejsFunction

  constructor(scope: Construct, id: string, props: DurableWeatherStackProps) {
    super(scope, id, props)
    this.id = id
    this.props = props

    this.createBucket()
    this.createDistribution()
    this.createDurableFunction()
    this.addSchedules()
  }

  private createBucket() {
    this.bucket = new Bucket(this, `${this.id}-bucket`, {
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  private createDistribution() {
    this.distribution = new Distribution(this, `${this.id}-distribution`, {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      defaultRootObject: 'index.html',
    })

    const uploadAssetsLogId = `${this.id}-uploadAssetsLogGroup`
    const uploadAssetsLog = new LogGroup(this, uploadAssetsLogId, {
      logGroupName: `/aws/lambda/${uploadAssetsLogId}`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })
    new BucketDeployment(this, `${this.id}-file-upload`, {
      sources: [Source.asset(path.join(__dirname, '../src/site'))],
      destinationBucket: this.bucket,
      prune: false,
      logGroup: uploadAssetsLog,
    })

    new CfnOutput(this, `${this.id}-url`, {
      description: 'Distribution URL',
      value: this.distribution.distributionDomainName,
    })
  }

  private createDurableFunction() {
    const paramId = `${this.id}-status-param`
    const siteStatusParam = new StringParameter(this, paramId, {
      parameterName: paramId,
      stringValue: 'Initial value',
      description: `Current status of the weather site for ${this.stackName}`,
    })

    const logGroupId = `${this.id}-durableFuncLogGroup`
    const logGroup = new LogGroup(this, logGroupId, {
      logGroupName: `/aws/lambda/${logGroupId}`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const funcId = `${this.id}-durableFunction`
    this.durableFunction = new NodejsFunction(this, funcId, {
      functionName: funcId,
      runtime: Runtime.NODEJS_24_X,
      entry: 'dist/src/functions/weather-workflow.js',
      loggingFormat: LoggingFormat.JSON,
      logGroup,
      tracing: Tracing.ACTIVE,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(60),
      memorySize: 3008,
      durableConfig: {
        executionTimeout: Duration.hours(1),
        retentionPeriod: Duration.days(14),
      },
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        LOCATION_NAME: this.props.locationName,
        OPEN_WEATHER_URL: this.props.openWeatherUrl,
        WEATHER_TYPE: this.props.weatherType,
        SSM_PARAM_NAME: siteStatusParam.parameterName,
        DISTRIBUTION_ID: this.distribution.distributionId,
        WEATHER_LOCATION_LAT: this.props.weatherLocationLat,
        WEATHER_LOCATION_LON: this.props.weatherLocationLon,
      },
    })

    this.durableFunction.role?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicDurableExecutionRolePolicy',
      ),
    )

    this.bucket.grantWrite(this.durableFunction)
    siteStatusParam.grantRead(this.durableFunction)
    siteStatusParam.grantWrite(this.durableFunction)

    this.durableFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${this.distribution.distributionId}`,
        ],
      }),
    )

    this.durableFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${Stack.of(this).region}:${Stack.of(this).account}:secret:weather-site-api-key*`,
        ],
      }),
    )
  }

  private addSchedules() {
    // $LATEST doesn't support resource-based policies, so use an alias
    const alias = this.durableFunction.addAlias('live')

    const queueName = `${this.id}-scheduler-dlq`
    const dlq = new Queue(this, queueName, {
      queueName,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const target = new LambdaInvoke(alias, {
      maxEventAge: Duration.minutes(5),
      retryAttempts: 2,
      deadLetterQueue: dlq,
    })

    for (let i = 0; i < this.props.schedules.length; i++) {
      const scheduleId = `${this.id}-schedule-${i}`
      new Schedule(this, scheduleId, {
        scheduleName: scheduleId,
        schedule: ScheduleExpression.expression(
          this.props.schedules[i],
          TimeZone.AMERICA_LOS_ANGELES,
        ),
        target,
        description: `Invoke durable function for ${this.id}`,
      })
    }
  }
}
