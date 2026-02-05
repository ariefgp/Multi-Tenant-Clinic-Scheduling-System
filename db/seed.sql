-- ============================================
-- Seed Data for Multi-Tenant Clinic Scheduling
-- ============================================

-- Tenant
INSERT INTO tenants (id, name, timezone) VALUES
  (1, 'Berlin Medical Center', 'Europe/Berlin');

-- Doctors
INSERT INTO doctors (id, tenant_id, name, email, specialty) VALUES
  (101, 1, 'Dr. Anna Schmidt', 'anna.schmidt@bmc.de', 'General Practice'),
  (102, 1, 'Dr. Hans Weber', 'hans.weber@bmc.de', 'Cardiology'),
  (103, 1, 'Dr. Maria Mueller', 'maria.mueller@bmc.de', 'Dermatology');

-- Patients
INSERT INTO patients (id, tenant_id, name, email, phone) VALUES
  (501, 1, 'Max Mustermann', 'max@example.com', '+49 30 12345678'),
  (502, 1, 'Erika Musterfrau', 'erika@example.com', '+49 30 87654321'),
  (503, 1, 'John Smith', 'john@example.com', '+49 30 11223344');

-- Rooms
INSERT INTO rooms (id, tenant_id, name, room_type) VALUES
  (11, 1, 'Room 101', 'consultation'),
  (12, 1, 'Room 102', 'consultation'),
  (13, 1, 'Room 103', 'procedure'),
  (14, 1, 'Imaging Room', 'imaging');

-- Devices
INSERT INTO devices (id, tenant_id, name, device_type) VALUES
  (21, 1, 'ECG Machine 1', 'ecg'),
  (22, 1, 'Ultrasound 1', 'ultrasound'),
  (23, 1, 'X-Ray Machine', 'xray');

-- Services
INSERT INTO services (id, tenant_id, name, duration_minutes, buffer_before_min, buffer_after_min, requires_room, color) VALUES
  (1, 1, 'General Consultation', 30, 5, 5, true, '#3B82F6'),
  (2, 1, 'ECG Examination', 45, 5, 10, true, '#10B981'),
  (3, 1, 'Skin Check', 20, 0, 5, true, '#F59E0B'),
  (4, 1, 'Ultrasound', 30, 5, 10, true, '#8B5CF6'),
  (5, 1, 'Phone Consultation', 15, 0, 0, false, '#6366F1');

-- Service-Doctor mappings (with tenant_id)
INSERT INTO service_doctors (service_id, doctor_id, tenant_id) VALUES
  (1, 101, 1), (1, 102, 1), (1, 103, 1),  -- All doctors do general consultation
  (2, 102, 1),                              -- Only cardiologist does ECG
  (3, 103, 1),                              -- Only dermatologist does skin check
  (4, 101, 1), (4, 102, 1),                -- GP and cardiologist do ultrasound
  (5, 101, 1), (5, 102, 1), (5, 103, 1);   -- All doctors do phone consultation

-- Service-Device mappings (with tenant_id)
INSERT INTO service_devices (service_id, device_id, tenant_id) VALUES
  (2, 21, 1),  -- ECG needs ECG machine
  (4, 22, 1);  -- Ultrasound needs ultrasound machine

-- Working hours (Mon-Fri, 08:00-17:00 for most)
-- Dr. Schmidt: split shift on Monday (08:00-12:00, 14:00-17:00)
INSERT INTO working_hours (tenant_id, doctor_id, weekday, start_time, end_time) VALUES
  -- Dr. Schmidt (101): Mon split shift, Tue-Fri normal
  (1, 101, 1, '08:00', '12:00'),
  (1, 101, 1, '14:00', '17:00'),
  (1, 101, 2, '08:00', '17:00'),
  (1, 101, 3, '08:00', '17:00'),
  (1, 101, 4, '08:00', '17:00'),
  (1, 101, 5, '08:00', '17:00'),
  -- Dr. Weber (102): Mon-Fri normal
  (1, 102, 1, '08:00', '17:00'),
  (1, 102, 2, '08:00', '17:00'),
  (1, 102, 3, '08:00', '17:00'),
  (1, 102, 4, '08:00', '17:00'),
  (1, 102, 5, '08:00', '17:00'),
  -- Dr. Mueller (103): Mon-Fri normal
  (1, 103, 1, '08:00', '17:00'),
  (1, 103, 2, '08:00', '17:00'),
  (1, 103, 3, '08:00', '17:00'),
  (1, 103, 4, '08:00', '17:00'),
  (1, 103, 5, '08:00', '17:00');

-- Reset sequences so future inserts don't collide
SELECT setval('tenants_id_seq', (SELECT MAX(id) FROM tenants));
SELECT setval('doctors_id_seq', (SELECT MAX(id) FROM doctors));
SELECT setval('patients_id_seq', (SELECT MAX(id) FROM patients));
SELECT setval('rooms_id_seq', (SELECT MAX(id) FROM rooms));
SELECT setval('devices_id_seq', (SELECT MAX(id) FROM devices));
SELECT setval('services_id_seq', (SELECT MAX(id) FROM services));
