import fastify from "fastify";

const server = fastify();

server.get("/health", async () => {
  return "yup ! I am healthy";
});

server.get("/where-are-you-deployed", async () => {
  return {
    "i-am-deployed-on": process.env.DEPLOYED_ON,
  };
});

server.listen({ host: "0.0.0.0", port: 8080 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
