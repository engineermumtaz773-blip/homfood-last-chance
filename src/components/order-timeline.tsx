import type { LiveOrderStatus } from "@/lib/order-api";

const stages = [
  { key: "received", title: "Order received" },
  { key: "confirmed", title: "Confirmed" },
  { key: "preparing", title: "Preparing" },
  { key: "ready", title: "Ready" },
  { key: "out_for_delivery", title: "On the way" },
  { key: "delivered", title: "Delivered" },
] as const;

const stageByStatus: Record<LiveOrderStatus["status"], number> = {
  new: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivering: 4,
  arriving: 4,
  completed: 5,
  cancelled: -1,
};

export function OrderTimeline({ order }: { order: LiveOrderStatus }) {
  const stageIndex = stageByStatus[order.status];
  const stage = order.kitchenStage || ({
    new: "received",
    confirmed: "confirmed",
    preparing: "preparing",
    ready: "ready",
    delivering: "out_for_delivery",
    arriving: "out_for_delivery",
    completed: "delivered",
    cancelled: "received",
  } as const)[order.status];
  const stagePosition = Math.max(0, stages.findIndex((entry) => entry.key === stage));
  const progress = stageIndex < 0 ? 0 : (stagePosition / (stages.length - 1)) * 100;
  const eta = order.etaMinutes !== null && order.etaMinutes !== undefined
    ? order.etaMinutes === 0 ? "Arriving now" : `About ${order.etaMinutes} minutes`
    : order.estimatedDelivery || "To be confirmed";

  return (
    <section className="order-timeline" aria-label="Kitchen preparation progress">
      <div className="order-timeline-heading">
        <strong>{order.status === "cancelled" ? "Order cancelled" : `Kitchen update: ${stages[stagePosition].title}`}</strong>
        <span>Estimated delivery: {eta}</span>
      </div>
      <div className="order-timeline-track" role="progressbar" aria-label="Order progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <ol>
        {stages.map((item, index) => (
          <li key={item.key} className={index <= stagePosition && stageIndex >= 0 ? "is-complete" : ""} aria-current={index === stagePosition && stageIndex >= 0 ? "step" : undefined}>
            <span aria-hidden="true">{index < stagePosition && stageIndex >= 0 ? "✓" : index + 1}</span>{item.title}
          </li>
        ))}
      </ol>
    </section>
  );
}
