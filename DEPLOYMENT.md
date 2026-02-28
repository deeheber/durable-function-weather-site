# 📦 Deployment

## Prerequisites

1. Install Node.js (see `.nvmrc` for required version)
2. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and [configure credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html)
3. Get an API key from [OpenWeatherMap](https://openweathermap.org/api/one-call-3)

## 🔧 Setup

1. Clone the repository

2. Ensure the `weather-site-api-key` secret exists in AWS Secrets Manager. If you already deployed the original [weather-site](https://github.com/deeheber/weather-site), this secret is already created. Otherwise, [create a secret](https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html):
   - Name: `weather-site-api-key`
   - Value: Your OpenWeatherMap API key (plaintext)

3. Copy `.env.example` to `.env` and configure:

   ```bash
   cp .env.example .env
   ```

   Set required variables: `WEATHER_LOCATION_LAT`, `WEATHER_LOCATION_LON`, `LOCATION_NAME`, `OPEN_WEATHER_URL`

4. Install dependencies:

   ```bash
   npm install
   ```

5. Set AWS profile (optional):
   ```bash
   export AWS_PROFILE=<your_aws_profile>
   ```

## 🚀 Deploy

```bash
npm run deploy
```

The CloudFront URL will be output to the console.

## 🧹 Cleanup

To delete all resources:

```bash
npm run destroy
```

If this is the only project using the `weather-site-api-key` secret, manually delete it from AWS Secrets Manager.
