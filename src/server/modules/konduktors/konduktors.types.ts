export type KonduktorRow = {
  id: string;
  user_id: string;
  employee_no: string;
  phone: string | null;
  email: string;
  full_name: string;
  is_active: boolean;
  bus_id: string | null;
  bus_plate: string | null;
  bus_name: string | null;
};

export type KonduktorView = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  employeeNo: string;
  phone: string | null;
  isActive: boolean;
  bus: { id: string; plateNumber: string; name: string } | null;
};
