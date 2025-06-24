import AppLayout from '@/components/layout/AppLayout';
import DashboardOverview from '@/components/dashboard/DashboardOverview';

export default function Home() {
  return (
    <AppLayout>
      <DashboardOverview />
    </AppLayout>
  );
}