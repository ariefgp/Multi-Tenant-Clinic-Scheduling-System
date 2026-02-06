import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout/DashboardLayout.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { servicesApi } from '../api/index.ts';

export function ServicesPage() {
  const { data: services, isLoading, error } = useQuery({
    queryKey: ['services'],
    queryFn: servicesApi.list,
  });

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Services</h1>

        {isLoading && <p className="text-gray-500">Loading services...</p>}

        {error && (
          <p className="text-red-500">Failed to load services. Please try again.</p>
        )}

        {services && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <Card key={service.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <Badge variant={service.isActive ? 'success' : 'secondary'}>
                      {service.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-gray-600">
                  <p>{service.durationMinutes} minutes</p>
                  {service.requiresRoom && <p>Requires room</p>}
                  {service.color && (
                    <div className="mt-2 flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded"
                        style={{ backgroundColor: service.color }}
                      />
                      <span>{service.color}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {services?.length === 0 && (
          <p className="text-gray-500">No services found.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
