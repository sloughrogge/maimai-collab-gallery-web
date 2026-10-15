export type LotteryState = "active" | "upcoming" | "ended" | "none" | "unknown";

export interface Consumption {
  type: "NONE" | "POINTS" | "CHANCES" | "UNKNOWN";
  points: string | null;
  chances: number | null;
  text: string;
}

export interface LotteryActivity {
  activityCode: string;
  activityName: string;
  activityStatusText: string;
  beginTime: string | null;
  endTime: string | null;
  drawPoint: string | null;
  drawTypeText: string | null;
  availablePoint: string | null;
  availableTimes: number | null;
  prizes: { name: string; imageUrl: string | null; typeText: string }[];
  drawDecision: {
    resourceEligible: boolean;
    reason: string | null;
    nextConsumption: Consumption;
    fallbackConsumption: Consumption | null;
  } | null;
}

export interface LotteryResponse {
  ok: true;
  checkedAt: string;
  state: LotteryState;
  activity: LotteryActivity | null;
  statusCode: string;
  statusMessage: string;
}

export interface LotteryErrorResponse {
  ok: false;
  error: { code: string; message: string; retryAfter?: number };
}

export class LotteryError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryAfter?: number;
  constructor(code: string, message: string, httpStatus = 502, retryAfter?: number) {
    super(message);
    this.name = "LotteryError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfter = retryAfter;
  }
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, limit = 300): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, limit) : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function consumption(value: unknown): Consumption | null {
  const item = record(value);
  if (!item) return null;
  return {
    type: item.type === "NONE" || item.type === "POINTS" || item.type === "CHANCES" ? item.type : "UNKNOWN",
    points: text(item.points, 40), chances: count(item.chances),
    text: text(item.text) ?? "官方暂未提供本次消耗说明",
  };
}

function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Normalize the official response only. Absence of data is a failure, never “no activity”. */
export function normalizeLotteryPayload(payload: unknown, now = new Date()): LotteryResponse {
  const envelope = record(payload);
  const data = record(envelope?.data);
  if (!envelope || envelope.code !== 200 || envelope.success === false || !data) {
    throw new LotteryError("UPSTREAM_RESPONSE", "麦当劳暂未返回完整的活动信息，请稍后重试。");
  }
  const status = record(data.status);
  const statusCode = text(status?.code, 80);
  const activityStatusText = text(data.activityStatusText, 80);
  if (!statusCode) throw new LotteryError("UPSTREAM_RESPONSE", "活动信息格式暂时无法识别，请稍后重试。");
  // “No activity” is accepted only when the official service explicitly says so.
  if (statusCode === "NO_ACTIVITY" || (statusCode === "SUCCESS" && activityStatusText === "活动不存在")) {
    return { ok: true, checkedAt: now.toISOString(), state: "none", activity: null,
      statusCode, statusMessage: "官方当前没有可展示的积分抽奖活动。" };
  }
  if (statusCode !== "SUCCESS" && statusCode !== "ACTIVITY_EXPIRED") {
    const code = statusCode.toUpperCase();
    if (/TOKEN|UNAUTHORIZED|UNAUTHENTICATED|LOGIN|AUTH_FAIL/.test(code)) {
      throw new LotteryError("INVALID_TOKEN", "Token 无效或已过期，请到麦当劳官方页面重新获取。", 401);
    }
    if (/RATE|FREQUENT|TOO_MANY/.test(code)) {
      throw new LotteryError("RATE_LIMITED", "查询过于频繁，请稍后再试。", 429, 30);
    }
    throw new LotteryError("UPSTREAM_BUSINESS", "麦当劳暂时无法查询这项活动，请稍后重试。");
  }
  const activityCode = text(data.activityCode, 120);
  const activityName = text(data.activityName, 160);
  if (!activityCode || !activityName || !activityStatusText || !Array.isArray(data.prizes) || data.prizes.length > 100) {
    throw new LotteryError("UPSTREAM_RESPONSE", "麦当劳返回的活动信息不完整，请稍后重试。");
  }
  const state: LotteryState = statusCode === "ACTIVITY_EXPIRED" ? "ended"
    : activityStatusText === "进行中" ? "active"
    : activityStatusText === "未开始" ? "upcoming"
    : activityStatusText === "已结束" ? "ended" : "unknown";
  const decision = record(data.drawDecision);
  const next = consumption(decision?.nextConsumption);
  return {
    ok: true, checkedAt: now.toISOString(), state, statusCode,
    statusMessage: "已从麦当劳实时查询活动信息。",
    activity: {
      activityCode, activityName, activityStatusText,
      beginTime: text(data.beginTime, 80), endTime: text(data.endTime, 80),
      drawPoint: text(data.drawPoint, 40), drawTypeText: text(data.drawTypeText, 160),
      availablePoint: text(data.availablePoint, 40), availableTimes: count(data.availableTimes),
      prizes: data.prizes.map((value) => {
        const prize = record(value);
        const name = text(prize?.name, 160);
        if (!prize || !name) throw new LotteryError("UPSTREAM_RESPONSE", "官方奖品信息暂时不完整，请稍后重试。");
        return { name, imageUrl: imageUrl(prize.imageUrl), typeText: text(prize.typeText, 80) ?? "奖品" };
      }),
      // Resource sufficiency is not an overall eligibility guarantee. Never infer it from balances.
      drawDecision: decision && typeof decision.resourceEligible === "boolean" && next ? {
        resourceEligible: decision.resourceEligible, reason: text(decision.reason),
        nextConsumption: next, fallbackConsumption: consumption(decision.fallbackConsumption),
      } : null,
    },
  };
}
