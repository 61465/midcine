import { Card, PriorityBadge, ModalityIcon } from '@midcine/ui';

type Modality = 'CT' | 'MR' | 'CR' | 'DR' | 'US' | 'XR' | 'PT' | 'NM';
type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

interface Study {
  studyUid: string;
  patientName: string;
  patientId: string;
  modality: Modality;
  bodyPart: string;
  priority: Priority;
  studyDate: string;
  description: string;
}

const sampleStudies: Study[] = [
  {
    studyUid: '1.2.3.STUDY.1',
    patientName: 'محمد أحمد',
    patientId: 'PAT-1234',
    modality: 'CT',
    bodyPart: 'BRAIN',
    priority: 'P1',
    studyDate: '2026-06-29',
    description: 'مخ — اشتباه نزيف',
  },
  {
    studyUid: '1.2.3.STUDY.2',
    patientName: 'فاطمة علي',
    patientId: 'PAT-5678',
    modality: 'CR',
    bodyPart: 'CHEST',
    priority: 'P3',
    studyDate: '2026-06-29',
    description: 'صدر — متابعة التهاب رئوي',
  },
  {
    studyUid: '1.2.3.STUDY.3',
    patientName: 'يوسف خالد',
    patientId: 'PAT-9101',
    modality: 'MR',
    bodyPart: 'BRAIN',
    priority: 'P4',
    studyDate: '2026-06-28',
    description: 'مخ — صداع مزمن',
  },
];

export default function WorklistPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">قائمة العمل</h1>
        <span className="text-sm text-gray-500">{sampleStudies.length} حالات</span>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">الأولوية</th>
                <th className="px-4 py-3 font-medium">المريض</th>
                <th className="px-4 py-3 font-medium">رقم المريض</th>
                <th className="px-4 py-3 font-medium">النوع</th>
                <th className="px-4 py-3 font-medium">العضو</th>
                <th className="px-4 py-3 font-medium">الوصف</th>
                <th className="px-4 py-3 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sampleStudies.map((s) => (
                <tr key={s.studyUid} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <PriorityBadge priority={s.priority} pulse />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{s.patientName}</td>
                  <td className="ltr-only whitespace-nowrap px-4 py-3 text-gray-600">{s.patientId}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <ModalityIcon modality={s.modality} />
                  </td>
                  <td className="ltr-only whitespace-nowrap px-4 py-3 text-gray-600">{s.bodyPart}</td>
                  <td className="px-4 py-3">{s.description}</td>
                  <td className="ltr-only whitespace-nowrap px-4 py-3 text-gray-600">{s.studyDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
