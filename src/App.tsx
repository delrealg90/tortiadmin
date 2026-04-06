import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate,
  Outlet,
  Link
} from 'react-router-dom';
import { 
  LayoutDashboard, 
  Truck, 
  Store, 
  Users, 
  Package, 
  TrendingUp, 
  DollarSign, 
  Plus, 
  LogOut, 
  ChevronRight, 
  ShoppingBag, 
  ArrowLeft,
  Settings,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Menu,
  X,
  MapPin,
  Trash2,
  Save,
  RefreshCcw,
  Coffee,
  Wifi,
  WifiOff,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  limit, 
  where,
  Timestamp,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { cn } from './lib/utils';
import PrivacyPolicy from './components/PrivacyPolicy';

// --- Error Handling & Validation ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Don't throw here to avoid crashing the whole app in callbacks
  // Instead, we could set a state, but for now, just logging is safer than crashing silently
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Algo salió mal. Por favor, intenta recargar la página.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.error.includes("insufficient permissions")) {
            errorMessage = "Error de permisos: No tienes autorización para realizar esta acción.";
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
          <div className="bg-red-500/10 p-4 rounded-full mb-6">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">¡Ups! Ha ocurrido un error</h1>
          <p className="text-gray-400 max-w-md mb-8">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors"
          >
            Recargar Aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Types ---
type UserRole = 'owner' | 'delivery' | 'counter';
type Subscription = 'free' | 'premium';

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  subscription: Subscription;
  ownerId?: string; // For staff members
  hasSeenTutorial?: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  threshold?: number;
  category: 'Materias Primas' | 'Limpieza' | 'Otros';
  expiryDate?: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  timestamp: any;
  notes?: string;
  imageUrl?: string;
}

interface Sale {
  id: string;
  type: 'counter' | 'delivery';
  amount: number;
  items: any[];
  timestamp: any;
  staffId: string;
  storeId?: string;
  storeName?: string;
}

interface CustomerStore {
  id: string;
  name: string;
  address: string;
}

// --- Context ---
const AuthContext = createContext<{
  user: AppUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

const useAuth = () => useContext(AuthContext);

// --- PWA Install Hook ---
function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setInstallPrompt(null);
    }
  };

  return { isInstallable, install };
}

// --- Components ---

const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center space-y-4">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"
    />
    <p className="text-gray-400 font-medium animate-pulse">Cargando TortiAdmin...</p>
  </div>
);

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string; 
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
        >
          <div className="flex items-center space-x-3 text-red-500 mb-4">
            <AlertCircle className="w-6 h-6" />
            <h2 className="text-2xl font-bold">{title}</h2>
          </div>
          <p className="text-gray-400 mb-8">{message}</p>
          <div className="flex space-x-3">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={() => { onConfirm(); onClose(); }}
              className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { isInstallable, install } = usePWAInstall();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <nav className="bg-[#111] border-b border-white/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-orange-500 p-2 rounded-lg">
              <Package className="text-white w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-white tracking-tight leading-none">TortiAdmin <span className="text-orange-500">Pro</span></span>
              {!isOnline && (
                <span className="text-[10px] text-red-500 font-bold flex items-center mt-1">
                  <WifiOff className="w-3 h-3 mr-1" /> MODO OFFLINE
                </span>
              )}
              {isOnline && (
                <span className="text-[10px] text-green-500 font-bold flex items-center mt-1">
                  <Wifi className="w-3 h-3 mr-1" /> EN LÍNEA
                </span>
              )}
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-6">
            {isInstallable && (
              <button 
                onClick={install}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-green-500/20 flex items-center"
              >
                <Plus className="w-3 h-3 mr-2" />
                Instalar App
              </button>
            )}
            {user?.subscription === 'free' && (
              <button 
                onClick={async () => {
                  if (confirm('¿Deseas activar TortiAdmin Premium? Esta es una demostración de la integración de suscripción.')) {
                    try {
                      await updateDoc(doc(db, 'users', user.uid), { subscription: 'premium' });
                      window.location.reload();
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
                    }
                  }
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/20 flex items-center"
              >
                <CreditCard className="w-3 h-3 mr-2" />
                Go Premium
              </button>
            )}
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium text-white">{user?.displayName}</span>
              <span className="text-xs text-gray-400 capitalize">{user?.role} {user?.subscription === 'premium' && '• Premium'}</span>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-400">
              {isOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden bg-[#111] border-b border-white/5 px-4 py-4 space-y-4"
          >
            {isInstallable && (
              <button 
                onClick={install}
                className="w-full flex items-center justify-center space-x-2 bg-green-500 text-white px-4 py-3 rounded-xl font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>Instalar Aplicación</span>
              </button>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">{user?.displayName}</span>
              <span className="text-xs text-gray-400 capitalize">{user?.role}</span>
            </div>
            <button 
              onClick={logout}
              className="flex items-center space-x-2 text-gray-400 hover:text-white w-full"
            >
              <LogOut className="w-5 h-5" />
              <span>Cerrar Sesión</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

// --- Modules ---

const AdComponent = ({ slot, id }: { slot: string, id: string }) => {
  const adRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (adRef.current && !adRef.current.getAttribute('data-adsbygoogle-status')) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("AdSense error:", e);
      }
    }
  }, []);

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-4 my-6 overflow-hidden relative group min-h-[100px] flex items-center justify-center">
      <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10 w-full">
        <ins ref={adRef}
             className="adsbygoogle"
             style={{ display: 'block' }}
             data-ad-client="ca-pub-7697265020412055"
             data-ad-slot={slot}
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest">Anuncio de Google</p>
          <p className="text-[10px] text-gray-600">ID: {id}</p>
        </div>
      </div>
    </div>
  );
};

const InterstitialAd = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const adRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (isOpen && adRef.current && !adRef.current.getAttribute('data-adsbygoogle-status')) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("Interstitial AdSense error:", e);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
      <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-8 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="text-center mb-8">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Anuncio Intersticial</p>
          <h3 className="text-xl font-bold text-white">TortiAdmin Pro</h3>
          <p className="text-gray-400 text-sm">Publicidad patrocinada</p>
        </div>
        <div className="min-h-[300px] flex items-center justify-center bg-white/5 rounded-2xl overflow-hidden">
          <ins ref={adRef}
               className="adsbygoogle"
               style={{ display: 'block', width: '100%', height: '100%' }}
               data-ad-client="ca-pub-7697265020412055"
               data-ad-slot="2200636047"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
        </div>
        <div className="mt-8 text-center">
          <button 
            onClick={onClose}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition-all"
          >
            Cerrar Anuncio
          </button>
          <p className="text-[10px] text-gray-600 mt-4">ID: tap3</p>
        </div>
      </div>
    </div>
  );
};

const OwnerDashboard = () => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [staff, setStaff] = useState<AppUser[]>([]);
  
  // Modals state
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: string, id: string, title: string } | null>(null);
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
  const [showInterstitial, setShowInterstitial] = useState(false);

  // Expense Filters
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseDateStart, setExpenseDateStart] = useState('');
  const [expenseDateEnd, setExpenseDateEnd] = useState('');

  // Form states
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffStaffRole, setNewStaffStaffRole] = useState<UserRole>('delivery');
  
  const [invForm, setInvForm] = useState<{
    name: string;
    quantity: number;
    unit: string;
    threshold: number;
    category: 'Materias Primas' | 'Limpieza' | 'Otros';
    expiryDate: string;
  }>({ 
    name: '', 
    quantity: 0, 
    unit: 'kg', 
    threshold: 5, 
    category: 'Materias Primas', 
    expiryDate: '' 
  });
  const [expForm, setExpForm] = useState({ description: '', amount: 0, category: 'General', notes: '', imageUrl: '' });

  useEffect(() => {
    if (!user) return;
    const ownerId = user.uid;

    const unsubInv = onSnapshot(collection(db, 'owners', ownerId, 'inventory'), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `owners/${ownerId}/inventory`));

    const unsubExp = onSnapshot(query(collection(db, 'owners', ownerId, 'expenses'), orderBy('timestamp', 'desc')), (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `owners/${ownerId}/expenses`));

    const unsubSales = onSnapshot(query(collection(db, 'owners', ownerId, 'sales'), orderBy('timestamp', 'desc')), (snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `owners/${ownerId}/sales`));

    const unsubStaff = onSnapshot(query(collection(db, 'users'), where('ownerId', '==', ownerId)), (snap) => {
      setStaff(snap.docs.map(d => d.data() as AppUser));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));

    return () => {
      unsubInv();
      unsubExp();
      unsubSales();
      unsubStaff();
    };
  }, [user]);

  const totalSales = sales.reduce((acc, s) => acc + s.amount, 0);
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netProfit = totalSales - totalExpenses;

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(expenseSearch.toLowerCase()) || 
                          e.category.toLowerCase().includes(expenseSearch.toLowerCase());
    
    if (!matchesSearch) return false;

    if (expenseDateStart || expenseDateEnd) {
      const expDate = e.timestamp?.toDate();
      if (!expDate) return true;
      
      if (expenseDateStart) {
        const start = new Date(expenseDateStart);
        if (expDate < start) return false;
      }
      if (expenseDateEnd) {
        const end = new Date(expenseDateEnd);
        end.setHours(23, 59, 59, 999);
        if (expDate > end) return false;
      }
    }
    
    return true;
  });

  const chartData = [
    { name: 'Ventas', value: totalSales },
    { name: 'Gastos', value: totalExpenses },
  ];

  const handleAddStaff = async () => {
    if (!newStaffEmail || !user) return;
    
    if (user.subscription === 'free' && staff.length >= 2) {
      alert('Límite de personal alcanzado para el plan gratuito. Actualiza a Premium para agregar más.');
      return;
    }

    try {
      // Create a document in 'users' with a random ID
      // The AuthProvider will find it by email when the user logs in
      const staffId = `pending_${Math.random().toString(36).substr(2, 9)}`;
      await setDoc(doc(db, 'users', staffId), {
        uid: staffId,
        email: newStaffEmail.toLowerCase().trim(),
        displayName: 'Pendiente de Registro',
        role: newStaffStaffRole,
        ownerId: user.uid,
        subscription: 'free'
      });
      alert(`Personal agregado: ${newStaffEmail}. El usuario debe iniciar sesión con este correo.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
    
    setIsAddingStaff(false);
    setNewStaffEmail('');
  };

  const handleSaveInventory = async () => {
    if (!user || !invForm.name) return;
    const ownerId = user.uid;

    if (!selectedInventory && user.subscription === 'free' && inventory.length >= 5) {
      alert('Límite de inventario alcanzado para el plan gratuito. Actualiza a Premium para agregar más.');
      return;
    }

    const data = { ...invForm, lastUpdated: serverTimestamp() };
    
    try {
      if (selectedInventory) {
        await updateDoc(doc(db, 'owners', ownerId, 'inventory', selectedInventory.id), data);
      } else {
        await addDoc(collection(db, 'owners', ownerId, 'inventory'), data);
      }
    } catch (error) {
      handleFirestoreError(error, selectedInventory ? OperationType.UPDATE : OperationType.CREATE, `owners/${ownerId}/inventory`);
    }
    setIsInventoryModalOpen(false);
    setSelectedInventory(null);
    setInvForm({ 
      name: '', 
      quantity: 0, 
      unit: 'kg', 
      threshold: 5, 
      category: 'Materias Primas', 
      expiryDate: '' 
    });
  };

  const handleSaveExpense = async () => {
    if (!user || !expForm.description) return;
    const ownerId = user.uid;
    try {
      await addDoc(collection(db, 'owners', ownerId, 'expenses'), {
        ...expForm,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `owners/${ownerId}/expenses`);
    }
    setIsExpenseModalOpen(false);
    setExpForm({ description: '', amount: 0, category: 'General', notes: '', imageUrl: '' });
  };

  const handleDelete = async () => {
    if (!user || !confirmDelete) return;
    const ownerId = user.uid;
    const { type, id } = confirmDelete;
    
    try {
      if (type === 'inventory') await deleteDoc(doc(db, 'owners', ownerId, 'inventory', id));
      if (type === 'expense') await deleteDoc(doc(db, 'owners', ownerId, 'expenses', id));
      if (type === 'store') await deleteDoc(doc(db, 'owners', ownerId, 'stores', id));
      if (type === 'staff') {
        await deleteDoc(doc(db, 'users', id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `owners/${ownerId}/${type}s/${id}`);
    }
    setConfirmDelete(null);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySales = sales.filter(s => s.timestamp?.toDate() >= today).reduce((acc, s) => acc + s.amount, 0);

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Panel de Control</h1>
          <p className="text-gray-400">Bienvenido de nuevo, {user?.displayName}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => {
              setSelectedInventory(null);
              setInvForm({ name: '', quantity: 0, unit: 'kg', threshold: 5, category: 'Materias Primas', expiryDate: '' });
              setIsInventoryModalOpen(true);
            }}
            className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors font-medium border border-white/10"
          >
            <Package className="w-4 h-4" />
            <span>Nuevo Insumo</span>
          </button>
          <button 
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors font-medium border border-white/10"
          >
            <DollarSign className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
          <button 
            onClick={() => setIsAddingStaff(true)}
            className="flex items-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            <Users className="w-4 h-4" />
            <span>Agregar Personal</span>
          </button>
          <button 
            onClick={() => setIsCashOutModalOpen(true)}
            className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors font-medium border border-white/10"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Corte de Caja</span>
          </button>
        </div>
      </header>

      {user?.subscription === 'free' && <AdComponent slot="3933557521" id="tap1" />}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-[#111] p-6 rounded-2xl border border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500/10 rounded-xl">
              <TrendingUp className="text-green-500 w-6 h-6" />
            </div>
          </div>
          <p className="text-gray-400 text-sm">Ventas de Hoy</p>
          <h3 className="text-2xl font-bold text-white mt-1">${todaySales.toLocaleString()}</h3>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-[#111] p-6 rounded-2xl border border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-500/10 rounded-xl">
              <DollarSign className="text-orange-500 w-6 h-6" />
            </div>
          </div>
          <p className="text-gray-400 text-sm">Ventas Totales</p>
          <h3 className="text-2xl font-bold text-white mt-1">${totalSales.toLocaleString()}</h3>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-[#111] p-6 rounded-2xl border border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-500/10 rounded-xl">
              <DollarSign className="text-red-500 w-6 h-6" />
            </div>
          </div>
          <p className="text-gray-400 text-sm">Gastos Totales</p>
          <h3 className="text-2xl font-bold text-white mt-1">${totalExpenses.toLocaleString()}</h3>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-[#111] p-6 rounded-2xl border border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-500/10 rounded-xl">
              <Package className="text-orange-500 w-6 h-6" />
            </div>
          </div>
          <p className="text-gray-400 text-sm">Utilidad Neta</p>
          <h3 className="text-2xl font-bold text-white mt-1">${netProfit.toLocaleString()}</h3>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Chart */}
        <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-semibold text-white mb-6">Comparativa Ventas vs Gastos</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory List */}
        <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Inventario</h3>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Categorías</span>
            </div>
          </div>
          <div className="space-y-4">
            {inventory.length > 0 ? inventory.map((item) => {
              const isLowStock = item.quantity <= (item.threshold || 5);
              const isExpired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
              
              return (
                <div 
                  key={item.id} 
                  className={cn(
                    "flex flex-col p-4 rounded-xl group border transition-all",
                    isLowStock || isExpired
                      ? "bg-red-500/5 border-red-500/20" 
                      : "bg-white/5 border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        isLowStock || isExpired ? "bg-red-500 animate-pulse" : "bg-green-500"
                      )} />
                      <span className="text-white font-medium">{item.name}</span>
                      <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-500 uppercase">{item.category}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={cn(
                        "text-sm font-bold",
                        isLowStock ? "text-red-500" : "text-gray-400"
                      )}>
                        {item.quantity} {item.unit}
                      </span>
                      <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setSelectedInventory(item);
                            setInvForm({ 
                              name: item.name, 
                              quantity: item.quantity, 
                              unit: item.unit, 
                              threshold: item.threshold || 5,
                              category: item.category || 'Materias Primas',
                              expiryDate: item.expiryDate || ''
                            });
                            setIsInventoryModalOpen(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setConfirmDelete({ type: 'inventory', id: item.id, title: 'Eliminar Insumo' })}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {item.expiryDate && (
                    <div className="flex items-center text-[10px] text-gray-500">
                      <AlertCircle className={cn("w-3 h-3 mr-1", isExpired ? "text-red-500" : "text-gray-500")} />
                      <span>Caducidad: {new Date(item.expiryDate).toLocaleDateString()}</span>
                      {isExpired && <span className="ml-2 text-red-500 font-bold uppercase">Expirado</span>}
                    </div>
                  )}
                </div>
              );
            }) : (
              <p className="text-gray-500 text-center py-8">No hay inventario registrado</p>
            )}
          </div>
        </div>
      </div>

      {/* Settlements Section */}
      <div className="bg-[#111] p-6 rounded-2xl border border-white/5 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
          <CreditCard className="w-5 h-5 mr-2 text-orange-500" />
          Cuentas por Personal
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map((member) => {
            const staffSales = sales.filter(s => s.staffId === member.uid);
            const total = staffSales.reduce((acc, s) => acc + s.amount, 0);
            return (
              <div key={member.uid} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white font-bold">{member.displayName}</span>
                  <span className="text-xs text-gray-500 capitalize">{member.role === 'delivery' ? 'Repartidor' : 'Mostrador'}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Ventas:</span>
                    <span className="text-white font-medium">{staffSales.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Recaudado:</span>
                    <span className="text-orange-500 font-bold">${total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {staff.length === 0 && <p className="text-gray-500 text-center py-8 col-span-full">Agrega personal para ver sus cuentas</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales History */}
        <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-semibold text-white mb-6">Historial de Ventas</h3>
          <div className="space-y-3">
            {sales.slice(0, 5).map((sale) => (
              <button 
                key={sale.id}
                onClick={() => setSelectedSale(sale)}
                className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <div>
                  <p className="text-white font-medium capitalize">{sale.type === 'counter' ? 'Mostrador' : 'Reparto'}</p>
                  <p className="text-xs text-gray-500">
                    {sale.timestamp?.toDate().toLocaleString() || 'Reciente'}
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-white font-bold">${sale.amount}</span>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </div>
              </button>
            ))}
            {sales.length === 0 && <p className="text-gray-500 text-center py-8">No hay ventas registradas</p>}
          </div>
        </div>

        {/* Staff List */}
        <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Personal</h3>
            <button 
              onClick={() => setIsAddingStaff(true)}
              className="text-orange-500 text-sm hover:underline"
            >
              Agregar
            </button>
          </div>
          <div className="space-y-4">
            {staff.length > 0 ? staff.map((member) => (
              <div key={member.uid} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-xs">
                    {member.displayName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{member.displayName}</p>
                    <p className="text-xs text-gray-500 capitalize">{member.role === 'delivery' ? 'Repartidor' : 'Mostrador'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setConfirmDelete({ type: 'staff', id: member.uid, title: 'Eliminar Personal' })}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )) : (
              <p className="text-gray-500 text-center py-8">No hay personal registrado</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h3 className="text-lg font-semibold text-white">Gastos</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar gastos..." 
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 w-40"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input 
                type="date" 
                value={expenseDateStart}
                onChange={(e) => setExpenseDateStart(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-orange-500"
              />
              <span className="text-gray-600 text-xs">-</span>
              <input 
                type="date" 
                value={expenseDateEnd}
                onChange={(e) => setExpenseDateEnd(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>
          <div className="space-y-3">
            {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
              <div key={expense.id} className="flex flex-col p-4 bg-white/5 rounded-xl group border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {expense.imageUrl && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                        <img src={expense.imageUrl} alt="Ticket" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      <p className="text-white font-medium">{expense.description}</p>
                      <p className="text-xs text-gray-500">{expense.category} • {expense.timestamp?.toDate().toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-red-500 font-bold">-${expense.amount}</span>
                    <button 
                      onClick={() => setConfirmDelete({ type: 'expense', id: expense.id, title: 'Eliminar Gasto' })}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expense.notes && (
                  <p className="mt-2 text-xs text-gray-400 italic border-t border-white/5 pt-2">
                    <span className="font-bold text-gray-500">Nota:</span> {expense.notes}
                  </p>
                )}
              </div>
            )) : (
              <p className="text-gray-500 text-center py-8">No se encontraron gastos con los filtros aplicados</p>
            )}
          </div>
      </div>

      {user?.subscription === 'free' && <AdComponent slot="9123033971" id="tap2" />}

      <InterstitialAd isOpen={showInterstitial} onClose={() => setShowInterstitial(false)} />

      {/* Inventory Modal */}
      <AnimatePresence>
        {isInventoryModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <h2 className="text-2xl font-bold text-white mb-2">{selectedInventory ? 'Editar Insumo' : 'Nuevo Insumo'}</h2>
              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nombre</label>
                  <input 
                    type="text" 
                    value={invForm.name}
                    onChange={(e) => setInvForm({ ...invForm, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    placeholder="Ej. Harina de Maíz"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Cantidad</label>
                    <input 
                      type="number" 
                      value={invForm.quantity}
                      onChange={(e) => setInvForm({ ...invForm, quantity: Number(e.target.value) })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Unidad</label>
                    <input 
                      type="text" 
                      value={invForm.unit}
                      onChange={(e) => setInvForm({ ...invForm, unit: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                      placeholder="kg, pza, etc"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoría</label>
                    <select 
                      value={invForm.category}
                      onChange={(e) => setInvForm({ ...invForm, category: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="Materias Primas">Materias Primas</option>
                      <option value="Limpieza">Limpieza</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Caducidad (Opcional)</label>
                    <input 
                      type="date" 
                      value={invForm.expiryDate}
                      onChange={(e) => setInvForm({ ...invForm, expiryDate: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Alerta Stock Bajo (Umbral)</label>
                  <input 
                    type="number" 
                    value={invForm.threshold}
                    onChange={(e) => setInvForm({ ...invForm, threshold: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button onClick={() => setIsInventoryModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white">Cancelar</button>
                  <button onClick={handleSaveInventory} className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-bold">Guardar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expense Modal */}
      <AnimatePresence>
        {isExpenseModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <h2 className="text-2xl font-bold text-white mb-2">Registrar Gasto</h2>
              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Descripción</label>
                  <input 
                    type="text" 
                    value={expForm.description}
                    onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    placeholder="Ej. Pago de Gas"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Monto</label>
                  <input 
                    type="number" 
                    value={expForm.amount}
                    onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Categoría</label>
                  <select 
                    value={expForm.category}
                    onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="Servicios">Servicios (Gas, Luz, Agua)</option>
                    <option value="Insumos">Insumos</option>
                    <option value="Sueldos">Sueldos</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Notas (Opcional)</label>
                  <textarea 
                    value={expForm.notes}
                    onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 min-h-[80px]"
                    placeholder="Detalles adicionales..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Foto del Ticket</label>
                  <div className="flex items-center space-x-3">
                    <label className="flex-1 cursor-pointer">
                      <div className="bg-white/5 border border-dashed border-white/20 rounded-xl p-4 flex flex-col items-center justify-center hover:bg-white/10 transition-colors">
                        {expForm.imageUrl ? (
                          <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                            <img src={expForm.imageUrl} alt="Ticket" className="w-full h-full object-cover" />
                            <button 
                              onClick={(e) => { e.preventDefault(); setExpForm({ ...expForm, imageUrl: '' }); }}
                              className="absolute top-2 right-2 bg-red-500 p-1 rounded-full text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Camera className="w-8 h-8 text-gray-500 mb-2" />
                            <span className="text-xs text-gray-500">Tomar foto o subir imagen</span>
                          </>
                        )}
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setExpForm({ ...expForm, imageUrl: reader.result as string });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="flex space-x-3 pt-4">
                  <button onClick={() => setIsExpenseModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white">Cancelar</button>
                  <button onClick={handleSaveExpense} className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-bold">Registrar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Staff Modal */}
      <AnimatePresence>
        {isAddingStaff && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <h2 className="text-2xl font-bold text-white mb-2">Agregar Personal</h2>
              <p className="text-gray-400 text-sm mb-6">El usuario podrá acceder con su cuenta de Google usando este correo.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Correo Electrónico</label>
                  <input 
                    type="email" 
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                    placeholder="ejemplo@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Rol</label>
                  <select 
                    value={newStaffStaffRole}
                    onChange={(e) => setNewStaffStaffRole(e.target.value as UserRole)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="delivery">Repartidor</option>
                    <option value="counter">Encargado de Mostrador</option>
                  </select>
                </div>
                <div className="flex space-x-3 pt-4">
                  <button onClick={() => setIsAddingStaff(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white">Cancelar</button>
                  <button onClick={handleAddStaff} className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-bold">Agregar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sale Details Modal */}
      <AnimatePresence>
        {selectedSale && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Detalle de Venta</h2>
                  <p className="text-xs text-gray-500">{selectedSale.timestamp?.toDate().toLocaleString()}</p>
                </div>
                <button onClick={() => setSelectedSale(null)} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Total Pagado</p>
                    <p className="text-2xl font-bold text-orange-500">${selectedSale.amount.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tipo de Venta</p>
                    <p className="text-lg font-bold text-white capitalize">{selectedSale.type === 'counter' ? 'Mostrador' : 'Reparto'}</p>
                  </div>
                </div>

                {selectedSale.storeName && (
                  <div className="p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10">
                    <p className="text-[10px] text-orange-500/70 uppercase tracking-widest mb-1">Tienda / Cliente</p>
                    <p className="text-white font-bold flex items-center">
                      <Store className="w-4 h-4 mr-2 text-orange-500" />
                      {selectedSale.storeName}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Productos</p>
                  <div className="space-y-2">
                    {selectedSale.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-gray-400">
                            {item.qty || item.quantity}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{item.name}</p>
                            {item.returned > 0 && (
                              <p className="text-[10px] text-red-500 font-bold">Devuelto: {item.returned} {item.unit || 'kg'}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-white">${((item.qty || item.quantity) * (item.price || 0)).toLocaleString()}</p>
                          {item.price && <p className="text-[10px] text-gray-500">${item.price}/{item.unit || 'kg'}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Atendido por:</span>
                    <span className="text-gray-300">{staff.find(s => s.uid === selectedSale.staffId)?.displayName || selectedSale.staffId}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white/5 border-t border-white/5">
                <button 
                  onClick={() => setSelectedSale(null)}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cash Out Modal */}
      <AnimatePresence>
        {isCashOutModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Corte de Caja</h2>
                <button onClick={() => setIsCashOutModalOpen(false)} className="text-gray-400 hover:text-white"><X /></button>
              </div>
              
              <div className="space-y-6">
                <div className="p-6 bg-orange-500/10 rounded-3xl border border-orange-500/20 text-center">
                  <p className="text-sm text-orange-500 font-medium mb-1">Ventas de Hoy</p>
                  <h3 className="text-4xl font-black text-white">${todaySales.toLocaleString()}</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between p-3 bg-white/5 rounded-xl">
                    <span className="text-gray-400">Ventas Mostrador:</span>
                    <span className="text-white font-bold">${sales.filter(s => s.type === 'counter' && s.timestamp?.toDate() >= today).reduce((acc, s) => acc + s.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-white/5 rounded-xl">
                    <span className="text-gray-400">Ventas Reparto:</span>
                    <span className="text-white font-bold">${sales.filter(s => s.type === 'delivery' && s.timestamp?.toDate() >= today).reduce((acc, s) => acc + s.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                    <span className="text-red-500/70">Gastos de Hoy:</span>
                    <span className="text-red-500 font-bold">-${expenses.filter(e => e.timestamp?.toDate() >= today).reduce((acc, e) => acc + e.amount, 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={() => {
                      if (user.subscription === 'free') {
                        setShowInterstitial(true);
                      } else {
                        alert('Corte de caja realizado con éxito. Se ha enviado un resumen a su correo.');
                      }
                      setIsCashOutModalOpen(false);
                    }}
                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold shadow-lg shadow-orange-500/20 transition-all active:scale-95"
                  >
                    Finalizar Día
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <ConfirmationModal 
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={confirmDelete?.title || 'Eliminar'}
        message="¿Estás seguro de que deseas eliminar este elemento? Esta acción no se puede deshacer."
      />
    </div>
  );
};

const DeliveryModule = () => {
  const { user } = useAuth();
  const [stores, setStores] = useState<CustomerStore[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isAddingStore, setIsAddingStore] = useState(false);
  const [isRegisteringDelivery, setIsRegisteringDelivery] = useState(false);
  const [selectedStore, setSelectedStore] = useState<CustomerStore | null>(null);
  const [selectedStoreHistory, setSelectedStoreHistory] = useState<CustomerStore | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'stores' | 'route'>('stores');
  const [showInterstitial, setShowInterstitial] = useState(false);
  
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddress, setNewStoreAddress] = useState('');

  const [deliveryForm, setDeliveryForm] = useState({
    tortillas: 0,
    tortillasPrice: 16,
    frijoles: 0,
    frijolesPrice: 15,
    tortillasReturned: 0,
    frijolesReturned: 0,
    paid: 0
  });

  const calculatedTotal = (deliveryForm.tortillas * deliveryForm.tortillasPrice) + (deliveryForm.frijoles * deliveryForm.frijolesPrice);

  const handleSaveDelivery = async () => {
    if (!user || !selectedStore) return;
    const ownerId = user.role === 'owner' ? user.uid : user.ownerId;
    if (!ownerId) return;

    try {
      const amount = deliveryForm.paid;
      await addDoc(collection(db, 'owners', ownerId, 'sales'), {
        type: 'delivery',
        storeId: selectedStore.id,
        storeName: selectedStore.name,
        amount,
        items: [
          { name: 'Tortilla de Maíz', qty: deliveryForm.tortillas, returned: deliveryForm.tortillasReturned, price: deliveryForm.tortillasPrice },
          { name: 'Frijoles Refritos', qty: deliveryForm.frijoles, returned: deliveryForm.frijolesReturned, price: deliveryForm.frijolesPrice }
        ],
        timestamp: serverTimestamp(),
        staffId: user.uid
      });
      if (user.subscription === 'free') {
        setShowInterstitial(true);
      } else {
        alert('Entrega registrada con éxito');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `owners/${ownerId}/sales`);
    }
    setIsRegisteringDelivery(false);
    setSelectedStore(null);
    setDeliveryForm({ 
      tortillas: 0, 
      tortillasPrice: 16, 
      frijoles: 0, 
      frijolesPrice: 15, 
      tortillasReturned: 0, 
      frijolesReturned: 0, 
      paid: 0 
    });
  };

  useEffect(() => {
    if (!user) return;
    const ownerId = user.role === 'owner' ? user.uid : user.ownerId;
    if (!ownerId) return;

    const unsubStores = onSnapshot(collection(db, 'owners', ownerId, 'stores'), (snap) => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerStore)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `owners/${ownerId}/stores`));

    const unsubSales = onSnapshot(query(collection(db, 'owners', ownerId, 'sales'), where('type', '==', 'delivery')), (snap) => {
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `owners/${ownerId}/sales`));

    return () => {
      unsubStores();
      unsubSales();
    };
  }, [user]);

  const handleAddStore = async () => {
    if (!newStoreName || !user) return;
    const ownerId = user.role === 'owner' ? user.uid : user.ownerId;
    if (!ownerId) return;

    try {
      await addDoc(collection(db, 'owners', ownerId, 'stores'), {
        name: newStoreName,
        address: newStoreAddress,
        ownerId
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `owners/${ownerId}/stores`);
    }
    setNewStoreName('');
    setNewStoreAddress('');
    setIsAddingStore(false);
  };

  const handleDeleteStore = async () => {
    if (!user || !confirmDelete) return;
    const ownerId = user.role === 'owner' ? user.uid : user.ownerId;
    if (!ownerId) return;
    try {
      await deleteDoc(doc(db, 'owners', ownerId, 'stores', confirmDelete.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `owners/${ownerId}/stores/${confirmDelete.id}`);
    }
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Módulo de Reparto</h1>
          <p className="text-gray-400">Gestiona tus rutas y entregas a tiendas</p>
        </div>
        <div className="flex items-center space-x-2 bg-white/5 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setActiveTab('stores')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'stores' ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"
            )}
          >
            Tiendas
          </button>
          <button 
            onClick={() => setActiveTab('route')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'route' ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"
            )}
          >
            Ruta
          </button>
        </div>
      </header>

      {user?.subscription === 'free' && <AdComponent slot="3933557521" id="tap1" />}

      {activeTab === 'stores' ? (
        <>
          <div className="flex justify-end">
            <button 
              onClick={() => setIsAddingStore(true)}
              className="flex items-center space-x-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Tienda</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <motion.div 
                key={store.id}
                whileHover={{ scale: 1.02 }}
                className="bg-[#111] p-6 rounded-2xl border border-white/5 group"
              >
                <div className="flex items-start justify-between">
                  <div className="p-3 bg-orange-500/10 rounded-xl">
                    <Store className="text-orange-500 w-6 h-6" />
                  </div>
                  <button 
                    onClick={() => setConfirmDelete({ id: store.id })}
                    className="text-gray-600 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-xl font-bold text-white mt-4">{store.name}</h3>
                <div className="flex items-center text-gray-400 text-sm mt-2">
                  <MapPin className="w-3 h-3 mr-1" />
                  {store.address || 'Sin dirección'}
                </div>
                
                <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setSelectedStoreHistory(store)}
                    className="col-span-2 bg-white/5 hover:bg-white/10 text-gray-300 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-center"
                  >
                    <RefreshCcw className="w-3 h-3 mr-2" />
                    Ver Historial
                  </button>
                </div>

                <button 
                  onClick={() => {
                    setSelectedStore(store);
                    setIsRegisteringDelivery(true);
                  }}
                  className="w-full mt-4 bg-white/5 hover:bg-orange-500 text-white py-3 rounded-xl transition-all font-bold"
                >
                  Registrar Entrega
                </button>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-[#111] p-8 rounded-3xl border border-white/5">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Ruta de Hoy</h3>
            <p className="text-gray-400">Orden sugerido para tus entregas</p>
          </div>
          
          <div className="max-w-md mx-auto relative">
            {/* Vertical Line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-white/5 z-0" />
            
            <div className="space-y-6 relative z-10">
              {stores.map((store, idx) => (
                <motion.div 
                  key={store.id} 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-start space-x-4"
                >
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-orange-500/20">
                    {idx + 1}
                  </div>
                  <div className="flex-1 p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-orange-500/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white font-bold">{store.name}</p>
                      <Store className="w-4 h-4 text-gray-600" />
                    </div>
                    <p className="text-xs text-gray-500 flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      {store.address}
                    </p>
                    
                    <div className="mt-4 flex items-center space-x-3">
                      <button 
                        onClick={() => {
                          setSelectedStore(store);
                          setIsRegisteringDelivery(true);
                        }}
                        className="text-[10px] bg-orange-500/10 text-orange-500 px-3 py-1.5 rounded-lg font-bold hover:bg-orange-500 hover:text-white transition-all"
                      >
                        Registrar Entrega
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
              {stores.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-gray-500">No hay tiendas registradas para generar una ruta.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {user?.subscription === 'free' && <AdComponent slot="9123033971" id="tap2" />}

      <InterstitialAd isOpen={showInterstitial} onClose={() => setShowInterstitial(false)} />

      {/* Register Delivery Modal */}
      <AnimatePresence>
        {isRegisteringDelivery && selectedStore && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <h2 className="text-2xl font-bold text-white mb-2">Registrar Entrega</h2>
              <p className="text-orange-500 font-medium mb-6">{selectedStore.name}</p>
              
              <div className="space-y-4">
                <div className="p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Total Sugerido:</span>
                    <span className="text-white font-bold text-xl">${calculatedTotal}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-xs font-bold text-orange-500 uppercase mb-3">Tortillas</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Cant (kg)</label>
                        <input 
                          type="number" 
                          value={deliveryForm.tortillas}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, tortillas: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Precio ($)</label>
                        <input 
                          type="number" 
                          value={deliveryForm.tortillasPrice}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, tortillasPrice: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Regreso</label>
                        <input 
                          type="number" 
                          value={deliveryForm.tortillasReturned}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, tortillasReturned: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-xs font-bold text-orange-500 uppercase mb-3">Frijoles</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Cant (pza)</label>
                        <input 
                          type="number" 
                          value={deliveryForm.frijoles}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, frijoles: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Precio ($)</label>
                        <input 
                          type="number" 
                          value={deliveryForm.frijolesPrice}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, frijolesPrice: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Regreso</label>
                        <input 
                          type="number" 
                          value={deliveryForm.frijolesReturned}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, frijolesReturned: Number(e.target.value) })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-400">Monto Pagado ($)</label>
                    <button 
                      onClick={() => setDeliveryForm({ ...deliveryForm, paid: calculatedTotal })}
                      className="text-[10px] text-orange-500 hover:underline"
                    >
                      Copiar total sugerido
                    </button>
                  </div>
                  <input 
                    type="number" 
                    value={deliveryForm.paid}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, paid: Number(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button onClick={() => setIsRegisteringDelivery(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white">Cancelar</button>
                  <button onClick={handleSaveDelivery} className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-bold">Guardar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Store History Modal */}
      <AnimatePresence>
        {selectedStoreHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">Historial: {selectedStoreHistory.name}</h2>
                  <p className="text-gray-400 text-sm">Registro de entregas pasadas</p>
                </div>
                <button onClick={() => setSelectedStoreHistory(null)} className="text-gray-400 hover:text-white"><X /></button>
              </div>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {sales.filter(s => s.storeId === selectedStoreHistory.id).map((sale) => (
                  <div key={sale.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs text-gray-500 font-medium">{sale.timestamp?.toDate().toLocaleString()}</span>
                      <span className="text-orange-500 font-bold">${sale.amount}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sale.items.map((item, i) => (
                        <span key={i} className="text-[10px] bg-white/5 px-2 py-1 rounded-md text-gray-400">
                          {item.qty}x {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {sales.filter(s => s.storeId === selectedStoreHistory.id).length === 0 && (
                  <p className="text-center py-12 text-gray-500">No hay entregas registradas para esta tienda.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDeleteStore}
        title="Eliminar Tienda"
        message="¿Estás seguro de que deseas eliminar esta tienda? Se perderá el acceso rápido a sus entregas."
      />

      {/* Add Store Modal */}
      <AnimatePresence>
        {isAddingStore && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md"
            >
              <h2 className="text-2xl font-bold text-white mb-2">Nueva Tienda</h2>
              <p className="text-gray-400 mb-6">Agrega una tienda a tu ruta de reparto</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nombre de la Tienda</label>
                  <input 
                    type="text" 
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="Abarrotes Doña Mari"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Dirección</label>
                  <input 
                    type="text" 
                    value={newStoreAddress}
                    onChange={(e) => setNewStoreAddress(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="Calle 123, Col. Centro"
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button 
                    onClick={() => setIsAddingStore(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleAddStore}
                    className="flex-1 px-4 py-3 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 transition-colors"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CounterModule = () => {
  const { user } = useAuth();
  const [cart, setCart] = useState<{name: string, price: number, qty: number}[]>([]);
  const [showInterstitial, setShowInterstitial] = useState(false);
  const products = [
    { name: 'Tortilla (1kg)', price: 20, unit: 'kg' },
    { name: 'Tortilla (1/2kg)', price: 10, unit: 'pza' },
    { name: 'Frijoles Refritos', price: 18, unit: 'bolsa' },
    { name: 'Masa de Maíz', price: 18, unit: 'kg' },
    { name: 'Salsa Casera', price: 15, unit: 'pza' },
    { name: 'Nixtamal', price: 16, unit: 'kg' },
    { name: 'Totopos', price: 25, unit: 'pza' },
    { name: 'Chicharrón', price: 190, unit: 'kg' },
    { name: 'Coca Cola 500ml', price: 18, unit: 'pza' },
    { name: 'Coca Cola 1.5lt', price: 30, unit: 'pza' },
    { name: 'Coca Cola 2.5lt', price: 40, unit: 'pza' },
    { name: 'Agua Embotellada', price: 20, unit: 'pza' },
  ];

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(p => p.name === product.name);
      if (existing) {
        return prev.map(p => p.name === product.name ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || !user) return;
    const ownerId = user.role === 'owner' ? user.uid : user.ownerId;
    if (!ownerId) return;

    try {
      await addDoc(collection(db, 'owners', ownerId, 'sales'), {
        type: 'counter',
        amount: total,
        items: cart,
        timestamp: serverTimestamp(),
        staffId: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `owners/${ownerId}/sales`);
    }
    setCart([]);
    if (user.subscription === 'free') {
      setShowInterstitial(true);
    } else {
      alert('Venta registrada con éxito');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
      <div className="lg:col-span-2 space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-white">Punto de Venta</h1>
          <p className="text-gray-400">Venta rápida de mostrador</p>
        </header>

        {user?.subscription === 'free' && <AdComponent slot="3933557521" id="tap1" />}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {products.map((product) => (
            <motion.button
              key={product.name}
              whileTap={{ scale: 0.95 }}
              onClick={() => addToCart(product)}
              className="bg-[#111] border border-white/5 p-6 rounded-2xl text-left hover:border-orange-500 transition-all group"
            >
              <div className="bg-orange-500/10 p-3 rounded-xl w-fit mb-4 group-hover:bg-orange-500 transition-colors">
                <ShoppingBag className="text-orange-500 w-6 h-6 group-hover:text-white" />
              </div>
              <h3 className="text-white font-bold">{product.name}</h3>
              <p className="text-orange-500 font-bold mt-1">${product.price} <span className="text-xs text-gray-500 font-normal">/ {product.unit}</span></p>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="bg-[#111] border border-white/5 rounded-3xl p-6 flex flex-col h-fit sticky top-24">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center">
          <ShoppingBag className="w-5 h-5 mr-2 text-orange-500" />
          Carrito de Venta
        </h3>

        <div className="flex-1 space-y-4 mb-8 max-h-[400px] overflow-y-auto pr-2">
          {cart.length > 0 ? cart.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">{item.qty} x ${item.price}</p>
              </div>
              <p className="text-white font-bold">${item.qty * item.price}</p>
            </div>
          )) : (
            <div className="text-center py-12">
              <Coffee className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500">El carrito está vacío</p>
            </div>
          )}
        </div>

        <div className="border-t border-white/5 pt-6 space-y-4">
          {user?.subscription === 'free' && <AdComponent slot="9123033971" id="tap2" />}
          <div className="flex items-center justify-between text-xl font-bold">
            <span className="text-gray-400">Total</span>
            <span className="text-white">${total}</span>
          </div>
          <button 
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 text-white py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-orange-500/20"
          >
            Finalizar Venta
          </button>
        </div>
      </div>

      <InterstitialAd isOpen={showInterstitial} onClose={() => setShowInterstitial(false)} />
    </div>
  );
};

// --- Main App & Auth ---

const Login = () => {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md bg-[#111]/50 backdrop-blur-xl border border-white/5 p-10 rounded-[2.5rem] shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="bg-orange-500 p-4 rounded-3xl shadow-xl shadow-orange-500/20 mb-6">
            <Package className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">TortiAdmin <span className="text-orange-500">Pro</span></h1>
          <p className="text-gray-400">La forma más eficiente de administrar tu tortillería</p>
        </div>

        <button 
          onClick={login}
          className="w-full bg-white text-black font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-3 hover:bg-gray-100 transition-all active:scale-[0.98]"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span>Continuar con Google</span>
        </button>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-4">Funciones Principales</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center">
              <div className="p-2 bg-white/5 rounded-lg mb-2">
                <LayoutDashboard className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-[10px] text-gray-400">Dashboard</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="p-2 bg-white/5 rounded-lg mb-2">
                <Truck className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-[10px] text-gray-400">Reparto</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="p-2 bg-white/5 rounded-lg mb-2">
                <Store className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-[10px] text-gray-400">Mostrador</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <p className="text-gray-600 text-sm">© 2026 TortiAdmin Pro • Hecho en México</p>
        <Link to="/privacy" className="text-orange-500/60 hover:text-orange-500 text-xs transition-colors">
          Política de Privacidad
        </Link>
      </div>
    </div>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (fbUser) {
          // 1. Try to find user by UID
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            setUser(userDoc.data() as AppUser);
          } else {
            // 2. Try to find user by email (in case they were added by an owner)
            const { getDocs } = await import('firebase/firestore');
            const q = query(collection(db, 'users'), where('email', '==', fbUser.email?.toLowerCase().trim()));
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              const existingDoc = querySnap.docs[0];
              const data = existingDoc.data() as AppUser;
              // Update the document to have the correct UID and display name
              const updatedUser = { 
                ...data, 
                uid: fbUser.uid, 
                displayName: fbUser.displayName || data.displayName 
              };
              await setDoc(doc(db, 'users', fbUser.uid), updatedUser);
              // Delete the placeholder doc if it had a different ID
              if (existingDoc.id !== fbUser.uid) {
                await deleteDoc(doc(db, 'users', existingDoc.id));
              }
              setUser(updatedUser);
            } else {
              // 3. Create new owner account
              const newUser: AppUser = {
                uid: fbUser.uid,
                email: fbUser.email!,
                displayName: fbUser.displayName!,
                role: 'owner',
                subscription: 'free',
                hasSeenTutorial: false
              };
              await setDoc(doc(db, 'users', fbUser.uid), newUser);
              setUser(newUser);
            }
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, fbUser ? `users/${fbUser.uid}` : 'auth');
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
            <Routes>
              <Route path="/login" element={<LoginWrapper />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<RoleRedirect />} />
                <Route path="owner" element={<RoleGuard roles={['owner']}><OwnerDashboard /></RoleGuard>} />
                <Route path="delivery" element={<RoleGuard roles={['owner', 'delivery']}><DeliveryModule /></RoleGuard>} />
                <Route path="counter" element={<RoleGuard roles={['owner', 'counter']}><CounterModule /></RoleGuard>} />
              </Route>
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const LoginWrapper = () => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" />;
  return <Login />;
};

const RoleGuard = ({ children, roles }: { children: React.ReactNode, roles: UserRole[] }) => {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" />;
  return <>{children}</>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

const RoleRedirect = () => {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;

  if (user.role === 'owner') return <Navigate to="/owner" />;
  if (user.role === 'delivery') return <Navigate to="/delivery" />;
  if (user.role === 'counter') return <Navigate to="/counter" />;
  
  return (
    <div className="p-8 text-center bg-[#0a0a0a] min-h-screen flex flex-col items-center justify-center">
      <AlertCircle className="w-12 h-12 text-orange-500 mb-4" />
      <h2 className="text-xl font-bold text-white mb-2">Error de rol</h2>
      <p className="text-gray-400">No se pudo determinar tu rol. Contacta al administrador.</p>
    </div>
  );
};

const OnboardingTutorial = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "¡Bienvenido a TortiAdmin Pro!",
      description: "La herramienta definitiva para digitalizar tu tortillería. Gestiona ventas, repartos e inventario desde un solo lugar.",
      icon: <Package className="w-12 h-12 text-orange-500" />,
    },
    {
      title: "Registro de Gastos",
      description: "En el Panel de Control, usa el botón 'Registrar Gasto' para anotar recibos o gas. ¡Incluso puedes tomar una foto del ticket para guardarlo!",
      icon: <Camera className="w-12 h-12 text-blue-500" />,
    },
    {
      title: "Gestión de Personal",
      description: "En la sección de 'Personal', puedes registrar a tus repartidores y encargados. Cada uno tendrá su propio acceso seguro.",
      icon: <Users className="w-12 h-12 text-purple-500" />,
    },
    {
      title: "Ventas y Repartos",
      description: "Usa los módulos de 'Mostrador' y 'Reparto' para registrar cada kilo vendido. Todo se sincroniza al instante con tu inventario.",
      icon: <TrendingUp className="w-12 h-12 text-green-500" />,
    }
  ];

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#111] border border-white/10 rounded-3xl p-8 max-w-md w-full text-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
          <motion.div 
            className="h-full bg-orange-500"
            initial={{ width: "0%" }}
            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mb-6 flex justify-center">
          <motion.div
            key={step}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {steps[step].icon}
          </motion.div>
        </div>

        <motion.h2 
          key={`title-${step}`}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="text-2xl font-bold text-white mb-4"
        >
          {steps[step].title}
        </motion.h2>

        <motion.p 
          key={`desc-${step}`}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="text-gray-400 mb-8 leading-relaxed"
        >
          {steps[step].description}
        </motion.p>

        <div className="flex items-center justify-between">
          <div className="flex space-x-1">
            {steps.map((_, i) => (
              <div 
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === step ? "bg-orange-500 w-4" : "bg-white/20"
                )}
              />
            ))}
          </div>
          <button 
            onClick={nextStep}
            className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-all flex items-center group"
          >
            {step === steps.length - 1 ? "Empezar" : "Siguiente"}
            <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const DashboardLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (user && !user.hasSeenTutorial) {
      setShowTutorial(true);
    }
  }, [user]);

  const handleTutorialComplete = async () => {
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { hasSeenTutorial: true });
        setShowTutorial(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {showTutorial && <OnboardingTutorial onComplete={handleTutorialComplete} />}

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111] border-t border-white/5 px-6 py-3 flex justify-around items-center z-50">
        {user?.role === 'owner' && (
          <button 
            onClick={() => navigate('/owner')}
            className={cn(
              "flex flex-col items-center",
              window.location.pathname === '/owner' ? "text-orange-500" : "text-gray-500"
            )}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px] mt-1">Dash</span>
          </button>
        )}
        {(user?.role === 'delivery' || user?.role === 'owner') && (
          <button 
            onClick={() => navigate('/delivery')}
            className={cn(
              "flex flex-col items-center",
              window.location.pathname === '/delivery' ? "text-orange-500" : "text-gray-500"
            )}
          >
            <Truck className="w-6 h-6" />
            <span className="text-[10px] mt-1">Ruta</span>
          </button>
        )}
        {(user?.role === 'counter' || user?.role === 'owner') && (
          <button 
            onClick={() => navigate('/counter')}
            className={cn(
              "flex flex-col items-center",
              window.location.pathname === '/counter' ? "text-orange-500" : "text-gray-500"
            )}
          >
            <Store className="w-6 h-6" />
            <span className="text-[10px] mt-1">Caja</span>
          </button>
        )}
      </div>
    </div>
  );
}
