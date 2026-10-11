import { CustomerMenu } from '@/features/menu/customer-menu';

export default function TableMenuPage({ params }: { params: { qrToken: string } }) {
  return <CustomerMenu qrToken={params.qrToken} />;
}
