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

## 🔄 CI/CD (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) uses [GitHub's OIDC integration with AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) to authenticate — no long-lived AWS credentials are stored in GitHub.

To set this up:

1. [Configure an OIDC identity provider](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) in your AWS account
2. Create an IAM role that the GitHub Actions runner can assume, scoping the trust policy to your repository
3. Add the role ARN as a GitHub Actions secret named `AWS_ROLE_TO_ASSUME` in your repository settings (**Settings → Secrets and variables → Actions**)
