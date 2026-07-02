import { AnatomyLab } from '../../_components/anatomy/anatomy-lab';

export const metadata = {
  title: 'midcine — مختبر التشريح',
};

export default function AnatomyPage() {
  return (
    <div className="h-full">
      <AnatomyLab />
    </div>
  );
}
