import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type ComponentStatus } from "@/customization/studio";

const VARIANT: Record<ComponentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  published: "outline",
  new: "default",
  changed: "secondary",
  deleted: "destructive",
};

export function StatusBadge({ status }: { status: ComponentStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
