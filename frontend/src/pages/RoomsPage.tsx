import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout/DashboardLayout.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { roomsApi } from '../api/index.ts';

export function RoomsPage() {
  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ['rooms'],
    queryFn: roomsApi.list,
  });

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Rooms</h1>

        {isLoading && <p className="text-gray-500">Loading rooms...</p>}

        {error && (
          <p className="text-red-500">Failed to load rooms. Please try again.</p>
        )}

        {rooms && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <Card key={room.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{room.name}</CardTitle>
                    <Badge variant={room.isActive ? 'success' : 'secondary'}>
                      {room.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-gray-600">
                  {room.roomType && <p>Type: {room.roomType}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {rooms?.length === 0 && (
          <p className="text-gray-500">No rooms found.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
