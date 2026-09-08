import type { DeliveryMethod } from "@grabmyseats/shared";
import { DELIVERY_METHOD_DESCRIPTION, DELIVERY_METHOD_LABEL } from "@/lib/deliveryMethod";

// Surfaces what the seller offers, and - when there's a real choice - lets
// the buyer pick before reserving. With only one method offered there's
// nothing to pick, so this just states it plainly instead of rendering a
// single, unselectable radio option.
export function DeliveryMethodPicker({
  availableDeliveryMethods,
  value,
  onChange,
  disabled = false,
}: {
  availableDeliveryMethods: DeliveryMethod[];
  value: DeliveryMethod | null;
  onChange: (value: DeliveryMethod) => void;
  disabled?: boolean;
}) {
  if (availableDeliveryMethods.length === 0) return null;

  if (availableDeliveryMethods.length === 1) {
    const method = availableDeliveryMethods[0];
    return (
      <div className="mt-4 rounded-lg border border-line bg-surface-raised px-4 py-3 text-left">
        <p className="text-sm font-medium text-foreground">
          Delivery: {DELIVERY_METHOD_LABEL[method]}
        </p>
        <p className="mt-1 text-xs text-muted">{DELIVERY_METHOD_DESCRIPTION[method]}</p>
      </div>
    );
  }

  return (
    <fieldset className="mt-4 flex flex-col gap-2 text-left">
      <legend className="mb-1 text-sm font-medium text-foreground">Delivery method</legend>
      {availableDeliveryMethods.map((method) => (
        <label
          key={method}
          className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-4 py-3 transition-colors ${
            value === method
              ? "border-gold bg-gold/10"
              : "border-line bg-surface-raised hover:border-gold/50"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="radio"
              name="deliveryMethod"
              checked={value === method}
              onChange={() => onChange(method)}
              disabled={disabled}
              className="accent-gold"
            />
            {DELIVERY_METHOD_LABEL[method]}
          </span>
          <span className="pl-6 text-xs text-muted">{DELIVERY_METHOD_DESCRIPTION[method]}</span>
        </label>
      ))}
    </fieldset>
  );
}
