import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout/DashboardLayout.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { doctorsApi } from '../api/index.ts';

export function DoctorsPage() {
  const { data: doctors, isLoading, error } = useQuery({
    queryKey: ['doctors'],
    queryFn: () => doctorsApi.list(),
  });

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Doctors</h1>

        {isLoading && <p className="text-gray-500">Loading doctors...</p>}

        {error && (
          <p className="text-red-500">Failed to load doctors. Please try again.</p>
        )}

        {doctors && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {doctors.map((doctor) => (
              <Card key={doctor.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{doctor.name}</CardTitle>
                    <Badge variant={doctor.isActive ? 'success' : 'secondary'}>
                      {doctor.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-gray-600">
                  {doctor.specialty && <p>{doctor.specialty}</p>}
                  {doctor.email && <p>{doctor.email}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {doctors?.length === 0 && (
          <p className="text-gray-500">No doctors found.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
