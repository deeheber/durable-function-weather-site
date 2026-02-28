import { Buffer } from 'buffer'

interface MockContext {
  step: ReturnType<typeof vi.fn>
  parallel: ReturnType<typeof vi.fn>
}

type HandlerFn = (
  event: unknown,
  context: MockContext,
) => Promise<{ status: string; updated: boolean }>

const { mockSsmSend, mockSecretsSend, mockS3Send, mockCloudfrontSend } =
  vi.hoisted(() => ({
    mockSsmSend: vi.fn(),
    mockSecretsSend: vi.fn(),
    mockS3Send: vi.fn(),
    mockCloudfrontSend: vi.fn(),
  }))

vi.mock('@aws/durable-execution-sdk-js', () => ({
  withDurableExecution: (fn: HandlerFn) => fn,
}))

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = mockSsmSend
  },
  GetParameterCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
  PutParameterCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
}))

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = mockSecretsSend
  },
  GetSecretValueCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send
  },
  PutObjectCommand: class {
    [key: string]: unknown
    constructor(params: Record<string, unknown>) {
      Object.assign(this, params)
    }
  },
}))

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class {
    send = mockCloudfrontSend
  },
  CreateInvalidationCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
}))

// Must import handler after mocks are set up
import { handler } from '../src/functions/weather-workflow'

const createMockContext = (): MockContext => ({
  step: vi.fn(async (_name: string, fn: () => Promise<unknown>) => await fn()),
  parallel: vi.fn(
    async (_name: string, fns: ((ctx: MockContext) => Promise<unknown>)[]) => {
      const ctx = createMockContext()
      return Promise.all(fns.map((fn) => fn(ctx)))
    },
  ),
})

const invokeHandler = handler as unknown as HandlerFn

const weatherResponse = (main: string) => ({
  ok: true,
  json: () =>
    Promise.resolve({
      current: { weather: [{ main }] },
    }),
})

const originalEnv = process.env

beforeEach(() => {
  vi.clearAllMocks()
  process.env = {
    ...originalEnv,
    BUCKET_NAME: 'test-bucket',
    LOCATION_NAME: 'Hillsboro, Oregon',
    OPEN_WEATHER_URL: 'https://openweathermap.org/city/5731371',
    WEATHER_TYPE: 'snow',
    SSM_PARAM_NAME: 'test-status-param',
    DISTRIBUTION_ID: 'E1234567890',
    WEATHER_LOCATION_LAT: '45.5229',
    WEATHER_LOCATION_LON: '-122.9898',
  }

  mockSsmSend.mockResolvedValue({
    Parameter: { Value: 'no snow' },
  })
  mockSecretsSend.mockResolvedValue({
    SecretString: 'test-api-key',
  })
  mockS3Send.mockResolvedValue({})
  mockCloudfrontSend.mockResolvedValue({})
  global.fetch = vi.fn()
})

afterEach(() => {
  process.env = originalEnv
})

const getUploadedHtml = (): string => {
  const s3Call = mockS3Send.mock.calls[0][0] as { Body: Buffer }
  return s3Call.Body.toString()
}

describe('Weather workflow durable function', () => {
  test('returns early when weather matches site status', async () => {
    mockSsmSend.mockResolvedValue({ Parameter: { Value: 'snow' } })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      weatherResponse('Snow'),
    )

    const result = await invokeHandler({}, createMockContext())

    expect(result).toEqual({ status: 'snow', updated: false })
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  test('YES + red background when weather matches type', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      weatherResponse('Snow'),
    )

    await invokeHandler({}, createMockContext())

    const html = getUploadedHtml()
    expect(html).toContain('YES!!!')
    expect(html).toContain('background-color: red')
    expect(html).toContain('<title>Is it snowing in Hillsboro, Oregon?</title>')
  })

  test('NO + green background when weather does not match type', async () => {
    mockSsmSend.mockResolvedValue({ Parameter: { Value: 'snow' } })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      weatherResponse('Clear'),
    )

    await invokeHandler({}, createMockContext())

    const html = getUploadedHtml()
    expect(html).toContain('NO.')
    expect(html).toContain('background-color: green')
  })

  test('strips trailing "e" for -ing suffix (haze -> hazing)', async () => {
    process.env.WEATHER_TYPE = 'haze'
    mockSsmSend.mockResolvedValue({ Parameter: { Value: 'no haze' } })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      weatherResponse('Haze'),
    )

    await invokeHandler({}, createMockContext())

    expect(getUploadedHtml()).toContain(
      '<title>Is it hazing in Hillsboro, Oregon?</title>',
    )
  })

  test('strips trailing "s" for -ing suffix (clouds -> clouding)', async () => {
    process.env.WEATHER_TYPE = 'clouds'
    mockSsmSend.mockResolvedValue({ Parameter: { Value: 'no clouds' } })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      weatherResponse('Clouds'),
    )

    await invokeHandler({}, createMockContext())

    expect(getUploadedHtml()).toContain(
      '<title>Is it clouding in Hillsboro, Oregon?</title>',
    )
  })
})
