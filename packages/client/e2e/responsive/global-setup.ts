import { truncateReport } from './probes/report';

export default async function globalSetup(): Promise<void> {
  truncateReport();
}
