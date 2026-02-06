import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout/DashboardLayout.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { patientsApi } from '../api/index.ts';

export function PatientsPage() {
  const { data: patients, isLoading, error } = useQuery({
    queryKey: ['patients'],
    queryFn: patientsApi.list,
  });

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Patients</h1>

        {isLoading && <p className="text-gray-500">Loading patients...</p>}

        {error && (
          <p className="text-red-500">Failed to load patients. Please try again.</p>
        )}

        {patients && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {patients.map((patient) => (
              <Card key={patient.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{patient.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-gray-600">
                  {patient.email && <p>{patient.email}</p>}
                  {patient.phone && <p>{patient.phone}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {patients?.length === 0 && (
          <p className="text-gray-500">No patients found.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
