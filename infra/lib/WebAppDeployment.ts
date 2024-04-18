import {
  Duration,
  aws_route53,
  aws_route53_targets,
  aws_wafv2 as wafv2,
} from "aws-cdk-lib";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import {
  CachePolicy,
  Distribution,
  IOrigin,
  PriceClass,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, RestApiOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import { Construct, IDependable } from "constructs";
import { Certificate } from "./certificate";

export class WebAppDeployment extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: {
      app: string;
      region: string;
      hostedZoneDomainName: string;
      domainName: string;
      deployOn: "Lambda" | "ECSFargate";
      webAppOnLambdaDefinition: () => RestApi;
      webAppOnECSFargateDefinition: () => {
        loadbalancer: ApplicationLoadBalancer;
        fargateService: FargateService;
        originDomainName: string;
      };
    }
  ) {
    super(scope, id);

    const {
      deployOn,
      app,
      webAppOnLambdaDefinition,
      webAppOnECSFargateDefinition,
    } = props;
    let httpOrigin: IOrigin;
    let originResourceArn: string;
    let cfDependencies: IDependable[] = [];

    const verifiyOriginHeaderSecret = new Secret(
      this,
      "verifiyOriginHeaderSecret",
      {
        secretName: `${app}-credentials-s`,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({}),
          excludePunctuation: true,
          includeSpace: false,
          generateStringKey: "VerifyOriginHeader",
        },
      }
    );

    const webAcl = this.getWebACLDefinition(verifiyOriginHeaderSecret);

    switch (deployOn) {
      case "Lambda": {
        const api = webAppOnLambdaDefinition();

        originResourceArn = api.deploymentStage.stageArn;

        httpOrigin = new RestApiOrigin(api, {
          customHeaders: {
            "x-origin-header": verifiyOriginHeaderSecret
              .secretValueFromJson("VerifyOriginHeader")
              .unsafeUnwrap(),
          },
        });

        cfDependencies.push(api);

        break;
      }

      case "ECSFargate": {
        const { originDomainName, fargateService, loadbalancer } =
          webAppOnECSFargateDefinition();

        httpOrigin = new HttpOrigin(originDomainName, {
          customHeaders: {
            "x-origin-header": verifiyOriginHeaderSecret
              .secretValueFromJson("VerifyOriginHeader")
              .unsafeUnwrap(),
          },
        });

        originResourceArn = loadbalancer.loadBalancerArn;
        cfDependencies.push(fargateService);

        break;
      }
      default: {
        throw new Error(`Deployment mode ${deployOn} not supported`);
      }
    }

    const webAclAssocitation = new CfnWebACLAssociation(
      this,
      "webacl-association",
      {
        resourceArn: originResourceArn,
        webAclArn: webAcl.attrArn,
      }
    );

    const { certificate } = new Certificate(this, Certificate.name, {
      hostedZoneDomainName: props.hostedZoneDomainName,
      domainName: props.domainName,
    });

    const distribution = new Distribution(this, "dist", {
      defaultBehavior: {
        origin: httpOrigin,
        cachePolicy: CachePolicy.CACHING_DISABLED,
      },
      certificate,
      domainNames: [props.domainName],
      priceClass: PriceClass.PRICE_CLASS_100,
    });

    distribution.node.addDependency(...cfDependencies, webAclAssocitation);

    const hostedZone = aws_route53.HostedZone.fromLookup(this, "hosted-zone", {
      domainName: props.hostedZoneDomainName,
    });
    new aws_route53.ARecord(this, "a-dns-record", {
      recordName: props.app,
      zone: hostedZone,
      target: aws_route53.RecordTarget.fromAlias(
        new aws_route53_targets.CloudFrontTarget(distribution)
      ),
      ttl: Duration.minutes(1),
    });
  }

  getWebACLDefinition(verifiyOriginHeaderSecret: ISecret) {
    return new wafv2.CfnWebACL(this, "webacl", {
      defaultAction: {
        block: {},
      },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "metric-for-webapp",
        sampledRequestsEnabled: true,
      },
      name: "webapp-webacl",
      rules: [
        {
          name: "OriginHeaderRule",
          priority: 1,
          action: {
            allow: {},
          },
          statement: {
            byteMatchStatement: {
              fieldToMatch: {
                singleHeader: { Name: "x-origin-header" },
              },
              positionalConstraint: "EXACTLY",
              searchString: verifiyOriginHeaderSecret
                .secretValueFromJson("VerifyOriginHeader")
                .unsafeUnwrap(),
              textTransformations: [
                {
                  priority: 0,
                  type: "NONE",
                },
              ],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "metric-for-webapp-origin-header",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });
  }
}
