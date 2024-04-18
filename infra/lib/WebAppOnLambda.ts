import {
  EndpointType,
  LambdaRestApi,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import { Architecture, LayerVersion } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { resolve } from "path";

export class WebAppOnLambda extends Construct {
  readonly api: RestApi;

  constructor(
    scope: Construct,
    id: string,
    props: { app: string; region: string }
  ) {
    super(scope, id);

    const fastifyFunction = new NodejsFunction(this, `function`, {
      entry: resolve("../src/index.ts"),
      functionName: `${props.app}-lambda`,
      memorySize: 512,
      architecture: Architecture.ARM_64,
      logRetention: RetentionDays.ONE_DAY,
      handler: "run.sh",
      environment: {
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        DEPLOYED_ON: "Lambda",
      },

      bundling: {
        minify: true,
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => {
            return [`cp ${inputDir}/../src/run.sh ${outputDir}`];
          },
        },
      },
      layers: [
        LayerVersion.fromLayerVersionArn(
          this,
          "layer",
          `arn:aws:lambda:${props.region}:753240598075:layer:LambdaAdapterLayerArm64:20`
        ),
      ],
    });

    this.api = new LambdaRestApi(this, "restapi", {
      handler: fastifyFunction,
      deploy: true,
      endpointTypes: [EndpointType.REGIONAL],
    });
  }
}
