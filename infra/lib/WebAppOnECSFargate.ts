import { aws_route53 } from "aws-cdk-lib";
import { IpAddresses, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Cluster, ContainerImage, FargateService } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import { Certificate } from "./certificate";

export class WebAppOnECSFargate extends Construct {
  readonly loadbalancer: ApplicationLoadBalancer;
  readonly fargateService: FargateService;
  readonly originDomainName: string;

  constructor(
    scope: Construct,
    id: string,
    props: {
      appName: string;
      hostedZoneDomainName: string;
    }
  ) {
    super(scope, id);

    const cluster = this.createECSCluster();
    this.originDomainName = `svc.${props.appName}.${props.hostedZoneDomainName}`;

    const hostedZone = aws_route53.HostedZone.fromLookup(this, "hosted-zone", {
      domainName: props.hostedZoneDomainName,
    });

    const { certificate } = new Certificate(this, Certificate.name, {
      hostedZoneDomainName: props.hostedZoneDomainName,
      domainName: this.originDomainName,
    });

    const loadBalancedService = new ApplicationLoadBalancedFargateService(
      this,
      "FargateService",
      {
        cluster,
        certificate,
        redirectHTTP: true,
        protocol: ApplicationProtocol.HTTPS,
        domainName: this.originDomainName,
        domainZone: hostedZone,
        taskImageOptions: {
          image: ContainerImage.fromAsset("../src"),
          containerPort: 8080,
          environment: {
            HOST: "0.0.0.0",
            PORT: "8080",
            DEPLOYED_ON: "ECS",
          },
        },
      }
    );

    loadBalancedService.targetGroup.configureHealthCheck({
      path: "/health",
    });

    this.fargateService = loadBalancedService.service;
    this.loadbalancer = loadBalancedService.loadBalancer;
  }

  createECSCluster() {
    const vpc = new Vpc(this, "wa-fagate", {
      ipAddresses: IpAddresses.cidr("10.0.0.0/24"),
      subnetConfiguration: [
        { name: "public-subnet", subnetType: SubnetType.PUBLIC },
        {
          name: "privat-subnet",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const cluster = new Cluster(this, "Cluster", { vpc });
    return cluster;
  }
}
