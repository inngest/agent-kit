export class AIGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIGatewayError";
  }
}
