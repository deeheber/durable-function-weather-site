import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'

import { DurableWeatherStack } from '../lib/durable-weather-stack'

describe('Durable weather stack', () => {
  test('Verify stack resources', () => {
    const app = new App()
    const stack = new DurableWeatherStack(app, 'MyTestStack', {
      locationName: 'Test Location',
      openWeatherUrl: 'https://api.openweathermap.org/data/2.5/onecall',
      schedules: 'rate(10 minutes)'.split(', '),
      weatherLocationLat: '123',
      weatherLocationLon: '456',
      weatherType: 'snow',
    })
    const template = Template.fromStack(stack)

    template.resourceCountIs('AWS::S3::Bucket', 1)
    template.resourceCountIs('AWS::SSM::Parameter', 1)
    template.resourceCountIs('AWS::CloudFront::Distribution', 1)
    template.resourceCountIs('AWS::Scheduler::Schedule', 1)
    template.resourceCountIs('AWS::SQS::Queue', 1)

    // No Step Functions resources
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 0)
    template.resourceCountIs('AWS::Events::Connection', 0)
    // No SNS resources
    template.resourceCountIs('AWS::SNS::Topic', 0)
    template.resourceCountIs('AWS::SNS::Subscription', 0)

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'MyTestStack-durableFunction',
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
    })

    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      Name: 'MyTestStack-schedule-0',
      ScheduleExpression: 'rate(10 minutes)',
    })

    expect(template.toJSON()).toMatchSnapshot()
  })
})
