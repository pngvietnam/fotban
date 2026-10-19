import { beforeEach, expect, it, vi } from "vitest";
const connection = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn(), on: vi.fn(), options: vi.fn() }));
vi.mock("pg", () => ({ Client: class { constructor(options: unknown) { connection.options(options); } connect = connection.connect; query = connection.query; end = connection.end; on = connection.on; } }));
import { PostgresSchedulerLock } from "../lib/scheduler-lock";
beforeEach(() => { vi.resetAllMocks(); connection.connect.mockResolvedValue(undefined); connection.query.mockResolvedValue({ rows: [{ locked: true }] }); connection.end.mockResolvedValue(undefined); });
it("holds one dedicated session advisory lock until explicit release", async () => {
  const lock = new PostgresSchedulerLock("postgresql://test-only"); const release = await lock.acquire();
  expect(connection.options).toHaveBeenCalledWith(expect.objectContaining({ application_name: "fmb-scheduler-lock", keepAlive: true })); expect(connection.query).toHaveBeenCalledWith("SELECT pg_try_advisory_lock(91531113) AS locked"); expect(connection.end).not.toHaveBeenCalled();
  await release!(); expect(connection.query).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock(91531113)"); expect(connection.end).toHaveBeenCalledTimes(1);
});
it("busy lock immediately closes its unused connection", async () => { connection.query.mockResolvedValue({ rows: [{ locked: false }] }); expect(await new PostgresSchedulerLock("test-only").acquire()).toBeNull(); expect(connection.end).toHaveBeenCalledTimes(1); });
it("connection failure becomes a safe database category without credentials", async () => { connection.connect.mockRejectedValue(new Error("secret-key")); await expect(new PostgresSchedulerLock("test-only").acquire()).rejects.toThrow("DATABASE"); expect(connection.end).toHaveBeenCalledTimes(1); });
it("lost session prevents further scheduler work", async () => { const lock = new PostgresSchedulerLock("test-only"); await lock.acquire(); const listener = connection.on.mock.calls[0][1] as () => void; listener(); expect(() => lock.assertHeld()).toThrow("LOCK_LOST"); });
it("release closes the connection even when unlock fails", async () => { const release = await new PostgresSchedulerLock("test-only").acquire(); connection.query.mockRejectedValue(new Error("Disconnected")); await expect(release!()).rejects.toThrow(); expect(connection.end).toHaveBeenCalledTimes(1); });
