import { redirect } from 'next/navigation';

export default function SocialGiftsPage() {
  redirect('/operations/social?type=gift');
}
