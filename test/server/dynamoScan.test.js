import { describe, it, expect, vi, beforeEach } from "vitest";

// The provider constructs real AWS clients at import time, so the SDK is
// stubbed before importing it. `sendMock` stands in for docClient.send and is
// driven per test to emulate DynamoDB's paging behaviour.
const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class FakeCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: sendMock }) },
    ScanCommand: class ScanCommand extends FakeCommand {},
    GetCommand: class GetCommand extends FakeCommand {},
    PutCommand: class PutCommand extends FakeCommand {},
    UpdateCommand: class UpdateCommand extends FakeCommand {},
    DeleteCommand: class DeleteCommand extends FakeCommand {},
    QueryCommand: class QueryCommand extends FakeCommand {},
    TransactWriteCommand: class TransactWriteCommand extends FakeCommand {},
  };
});

const { default: DynamoDBProvider } = await import(
  "../../server/providers/DynamoDBProvider.js"
);

/** A provider with the SDK stubbed out and the doc client wired to sendMock. */
function makeProvider() {
  const provider = new DynamoDBProvider();
  provider.docClient = { send: sendMock };
  provider.tables = provider.tables || {};
  return provider;
}

const item = (n) => ({ id: `item-${n}`, game_id: "g1" });

/** Emulates DynamoDB returning `pages` sequential pages of `perPage` items. */
function respondWithPages(pages, perPage) {
  let n = 0;
  sendMock.mockImplementation(() => {
    const Items = Array.from({ length: perPage }, () => item(n++));
    const isLast = sendMock.mock.calls.length >= pages;
    return Promise.resolve({
      Items,
      ScannedCount: perPage,
      ...(isLast ? {} : { LastEvaluatedKey: { id: `item-${n - 1}` } }),
    });
  });
}

beforeEach(() => {
  sendMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("_dynamoScan pagination", () => {
  it("returns a single page unchanged when there is no LastEvaluatedKey", async () => {
    sendMock.mockResolvedValue({ Items: [item(1), item(2)], ScannedCount: 2 });

    const result = await makeProvider()._dynamoScan("picks");

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.Items).toHaveLength(2);
    expect(result.Count).toBe(2);
    expect(result.ScannedCount).toBe(2);
  });

  // The regression this fix exists for: before pagination, everything past
  // the first 1 MB page was dropped with no error.
  it("follows LastEvaluatedKey and returns every page's items", async () => {
    respondWithPages(4, 25);

    const result = await makeProvider()._dynamoScan("picks", { game_id: "g1" });

    expect(sendMock).toHaveBeenCalledTimes(4);
    expect(result.Items).toHaveLength(100);
    expect(result.Count).toBe(100);
  });

  it("passes ExclusiveStartKey through on every page after the first", async () => {
    respondWithPages(3, 10);

    await makeProvider()._dynamoScan("picks");

    const [first, second, third] = sendMock.mock.calls.map(([cmd]) => cmd.input);
    expect(first.ExclusiveStartKey).toBeUndefined();
    expect(second.ExclusiveStartKey).toEqual({ id: "item-9" });
    expect(third.ExclusiveStartKey).toEqual({ id: "item-19" });
  });

  it("carries the FilterExpression onto continuation pages", async () => {
    respondWithPages(2, 5);

    await makeProvider()._dynamoScan("picks", { game_id: "g1" });

    for (const [cmd] of sendMock.mock.calls) {
      expect(cmd.input.FilterExpression).toBe("#field0 = :value0");
      expect(cmd.input.ExpressionAttributeValues).toEqual({ ":value0": "g1" });
      expect(cmd.input.ExpressionAttributeNames).toEqual({ "#field0": "game_id" });
    }
  });

  it("sums ScannedCount across pages", async () => {
    respondWithPages(3, 40);

    const result = await makeProvider()._dynamoScan("picks");

    expect(result.ScannedCount).toBe(120);
  });

  it("preserves item order across page boundaries", async () => {
    respondWithPages(3, 2);

    const result = await makeProvider()._dynamoScan("picks");

    expect(result.Items.map((i) => i.id)).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
  });

  it("handles a page that filters out every item but still has more to scan", async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [], ScannedCount: 500, LastEvaluatedKey: { id: "a" } })
      .mockResolvedValueOnce({ Items: [item(1)], ScannedCount: 100 });

    const result = await makeProvider()._dynamoScan("picks", { game_id: "g1" });

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result.Items).toHaveLength(1);
    expect(result.ScannedCount).toBe(600);
  });

  it("warns when a scan needed more than one page", async () => {
    respondWithPages(2, 5);

    await makeProvider()._dynamoScan("picks");

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Multi-page SCAN"),
      expect.objectContaining({ pages: 2 })
    );
  });

  it("propagates an error raised on a later page rather than returning partial data", async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [item(1)], ScannedCount: 1, LastEvaluatedKey: { id: "a" } })
      .mockRejectedValueOnce(new Error("ProvisionedThroughputExceededException"));

    await expect(makeProvider()._dynamoScan("picks")).rejects.toThrow(
      "ProvisionedThroughputExceededException"
    );
  });

  it("logs an error, not a silent truncation, if the page ceiling is ever hit", async () => {
    // Never stops handing back a LastEvaluatedKey.
    sendMock.mockResolvedValue({
      Items: [item(1)],
      ScannedCount: 1,
      LastEvaluatedKey: { id: "endless" },
    });

    const result = await makeProvider()._dynamoScan("picks");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("TRUNCATED"),
      expect.any(Object)
    );
    expect(result.Items.length).toBeGreaterThan(0);
  });
});
