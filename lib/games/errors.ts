/** An expected failure with a message that is safe to show to the user. */
export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
