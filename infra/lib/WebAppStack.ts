import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { WebAppDeployment } from "./WebAppDeployment";
import { WebAppOnECSFargate } from "./WebAppOnECSFargate";
import { WebAppOnLambda } from "./WebAppOnLambda";

export class WebAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const hostedZoneDomainName = "inflow-it.com";
    const appName = `awesome-web-app`;
    const domainName = `${appName}.${hostedZoneDomainName}`;

    new WebAppDeployment(this, "webappdeployment", {
      app: appName,
      domainName,
      hostedZoneDomainName,
      region: this.region,

      deployOn: "ECSFargate",

      webAppOnLambdaDefinition: () => {
        const { api } = new WebAppOnLambda(this, "web-app-on-lambda", {
          app: appName,
          region: this.region,
        });
        return api;
      },

      webAppOnECSFargateDefinition: () => {
        const { loadbalancer, fargateService, originDomainName } =
          new WebAppOnECSFargate(this, "web-app-on-ecs-fargate", {
            appName,
            hostedZoneDomainName,
          });
        return { loadbalancer, fargateService, originDomainName };
      },
    });
  }
}
