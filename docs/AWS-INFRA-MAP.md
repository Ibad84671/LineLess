
# .github\workflows\quality.yml
name: LineLess Quality
on:
  push:
    branches: [main]
    branches: [main]
permissions:
  contents: read
concurrency:
  group: quality-${{ github.workflow }}-${{ github.ref }}
jobs:
  quality:
    steps:

# infrastructure\lineless.yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: >
Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]
    Description: Deployment environment (used in resource names).
  SenderEmail:
    Type: String
    Default: ""
    Description: Verified SES sender identity. If empty, email notifications are skipped (queue features unaffected).
  EnableSmsNotifications:
    Type: String
    Default: "false"
    AllowedValues: ["true", "false"]
    Description: Create an SNS topic and enable SMS notifications (optional paid feature).
  LogRetentionDays:
    Type: Number
    Default: 30
    AllowedValues: [7, 14, 30, 90, 180, 365]
    Description: CloudWatch log retention for Lambda logs.
  WsDeploymentVersion:
    Type: String
    Default: v1
    Description: >-
  LambdaCodeBucket:
    Type: String
    Description: S3 bucket containing the packaged Lambda artifact (created by scripts/deploy.ps1).
  LambdaCodeKey:
    Type: String
    Description: S3 object key of the packaged Lambda artifact zip.
Conditions:
  SmsEnabled: !Equals [!Ref EnableSmsNotifications, "true"]
  SesConfigured: !Not [!Equals [!Ref SenderEmail, ""]]
Resources:
  MainTable:
    Type: AWS::DynamoDB::Table
    Properties:
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
  ApiFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
  ApiFunctionRole:
    Type: AWS::IAM::Role
    Properties:
  ApiFunction:
    Type: AWS::Lambda::Function
    Properties:
  WsFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
  WsFunctionRole:
    Type: AWS::IAM::Role
    Properties:
  WsFunction:
    Type: AWS::Lambda::Function
    Properties:
  EventBus:
    Type: AWS::Events::EventBus
    Properties:
  BroadcasterRule:
    Type: AWS::Events::Rule
    Properties:
  NotificationRule:
    Type: AWS::Events::Rule
    Properties:
  EventRuleDLQ:
    Type: AWS::SQS::Queue
    Properties:
  NotificationQueue:
    Type: AWS::SQS::Queue
    Properties:
  NotificationDLQ:
    Type: AWS::SQS::Queue
    Properties:
  NotificationQueuePolicy:
    Type: AWS::SQS::QueuePolicy
    Properties:
  SmsTopic:
    Type: AWS::SNS::Topic
    Condition: SmsEnabled
    Properties:
  BroadcasterFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
  BroadcasterFunctionRole:
    Type: AWS::IAM::Role
    Properties:
  BroadcasterFunction:
    Type: AWS::Lambda::Function
    Properties:
  BroadcasterInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
  NotificationWorkerLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
  NotificationWorkerRole:
    Type: AWS::IAM::Role
    Properties:
  NotificationWorker:
    Type: AWS::Lambda::Function
    Properties:
  NotificationWorkerEventSourceMapping:
    Type: AWS::Lambda::EventSourceMapping
    Properties:
  HttpApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
  HttpApiIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
  HttpApiProxyRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
  HttpApiInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
  HttpApiStage:
    Type: AWS::ApiGatewayV2::Stage
    Properties:
  WsApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
  WsConnectIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
  WsConnectRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
  WsDefaultRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
  WsDisconnectRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
  WsDefaultRouteResponse:
    Type: AWS::ApiGatewayV2::RouteResponse
    Properties:
  WsInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
  WsDeployment:
    Type: AWS::ApiGatewayV2::Deployment
    DependsOn:
    Properties:
  WsStage:
    Type: AWS::ApiGatewayV2::Stage
    Properties:
  FrontendBucket:
    Type: AWS::S3::Bucket
    UpdateReplacePolicy: Delete
    DeletionPolicy: Delete
    Properties:
  FrontendOriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
  FrontendBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
  SecurityHeadersPolicy:
    Type: AWS::CloudFront::ResponseHeadersPolicy
    Properties:
  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
  Api5xxAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
  NotificationDlqAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
  LambdaErrorsAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
Outputs:
  CloudFrontURL:
    Description: Frontend base URL
    Value: !Sub "https://${CloudFrontDistribution.DomainName}"
  DistributionId:
    Description: CloudFront distribution ID (for cache invalidation)
    Value: !Ref CloudFrontDistribution
  FrontendBucketName:
    Description: S3 bucket holding the frontend assets
    Value: !Ref FrontendBucket
  ApiUrl:
    Description: HTTP API base URL
    Value: !GetAtt HttpApi.ApiEndpoint
  WebSocketUrl:
    Description: WebSocket endpoint (wss)
    Value: !Sub "${WsApi.ApiEndpoint}/${Environment}"
  UserPoolId:
    Description: Cognito user pool ID
    Value: !Ref UserPool
  UserPoolClientId:
    Description: Cognito app client ID
    Value: !Ref UserPoolClient
  CognitoIssuer:
    Description: Cognito issuer URL (token verification)
    Value: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"
  TableName:
    Description: Main DynamoDB table
    Value: !Ref MainTable
  EventBusName:
    Description: Domain event bus
    Value: !Ref EventBus
  NotificationQueueUrl:
    Description: Notification SQS queue
    Value: !Ref NotificationQueue
  NotificationDlqUrl:
    Description: Notification DLQ (should stay empty)
    Value: !Ref NotificationDLQ
  SmsTopicArn:
    Condition: SmsEnabled
    Description: Optional SMS topic (only when SMS notifications enabled)
    Value: !Ref SmsTopic
