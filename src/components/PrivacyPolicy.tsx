import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12">
      <button 
        onClick={() => navigate(-1)}
        className="mb-8 flex items-center gap-2 text-orange-500 hover:text-orange-400 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Volver
      </button>

      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-orange-500">Política de Privacidad</h1>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Información que Recopilamos</h2>
          <p className="text-gray-400 leading-relaxed">
            TortiAdmin Pro recopila información necesaria para la gestión de su negocio, incluyendo nombres de repartidores, registros de ventas y gastos. Estos datos se almacenan de forma segura en Google Firebase.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Uso de la Información</h2>
          <p className="text-gray-400 leading-relaxed">
            La información se utiliza exclusivamente para generar reportes de ventas, cálculos de comisiones y control administrativo interno de su tortillería. No compartimos estos datos con terceros.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. Seguridad de los Datos</h2>
          <p className="text-gray-400 leading-relaxed">
            Utilizamos servicios de Google Cloud y Firebase con reglas de seguridad estrictas para proteger su información contra accesos no autorizados.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Sus Derechos</h2>
          <p className="text-gray-400 leading-relaxed">
            Usted tiene derecho a acceder, rectificar o eliminar sus datos en cualquier momento a través de las herramientas de administración de la aplicación.
          </p>
        </section>

        <footer className="mt-12 pt-8 border-t border-white/10 text-gray-500 text-sm">
          Última actualización: Abril 2026 | TortiAdmin Pro
        </footer>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
