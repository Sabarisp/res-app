import { OrderTracking } from '@/features/orders/order-tracking';

export default function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  return <OrderTracking orderId={params.orderId} />;
}
