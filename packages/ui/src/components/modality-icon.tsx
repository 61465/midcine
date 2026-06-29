import { Brain, Activity, Bone, Heart, Baby, Microscope } from 'lucide-react';
import type { Modality } from '../tokens';

const modalityIcons: Record<Modality, React.ComponentType<{ className?: string }>> = {
  CT: Brain,
  MR: Activity,
  CR: Bone,
  DR: Bone,
  US: Baby,
  MG: Heart,
  NM: Microscope,
  PT: Microscope,
};

interface ModalityIconProps {
  modality: Modality;
  className?: string;
}

export function ModalityIcon({ modality, className }: ModalityIconProps) {
  const Icon = modalityIcons[modality] ?? Activity;
  return <Icon className={className} aria-label={modality} />;
}
