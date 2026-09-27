import { getDisasterRecoveryData } from "@/features/disaster-recovery/queries";
import { DisasterRecoveryView } from "@/features/disaster-recovery/DisasterRecoveryView";

export default async function DisasterRecoveryPage() {
  const data = await getDisasterRecoveryData();
  return <DisasterRecoveryView data={data} />;
}
