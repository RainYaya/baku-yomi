import { useSettingsStore } from '../../stores/settingsSlice';
import { PAIR_ORDER_LABELS, type PairOrder } from '../../lib/pairOrder';

const ORDERS: PairOrder[] = ['ja-zh', 'zh-ja'];

/**
 * The one control every surface uses for bilingual order. It writes the global
 * setting, so the reader, review list, practice desk and video page never
 * disagree about which language sits on the primary line.
 */
export function PairOrderToggle({ className = '' }: { className?: string }) {
  const pairOrder = useSettingsStore((s) => s.pairOrder);
  const setPairOrder = useSettingsStore((s) => s.setPairOrder);

  return (
    <div
      className={`pair-order-toggle${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="双语顺序"
    >
      {ORDERS.map((order) => (
        <button
          key={order}
          type="button"
          aria-pressed={pairOrder === order}
          onClick={() => setPairOrder(order)}
        >
          {PAIR_ORDER_LABELS[order]}
        </button>
      ))}
    </div>
  );
}
