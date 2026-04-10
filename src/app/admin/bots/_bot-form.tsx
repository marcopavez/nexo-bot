'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Bot } from '@/lib/types';

type Service = { nombre: string; precio: string; descripcion: string };

interface BotFormProps {
  initial?: Bot;
}

const BUSINESS_TYPES: { value: Bot['business_type']; label: string }[] = [
  { value: 'shop', label: 'Tienda / Comercio' },
  { value: 'clinic', label: 'Clínica / Salud' },
  { value: 'law_firm', label: 'Estudio jurídico' },
  { value: 'other', label: 'Otro' },
];

function emptyService(): Service {
  return { nombre: '', precio: '', descripcion: '' };
}

export default function BotForm({ initial }: BotFormProps) {
  const router = useRouter();
  const isEdit = !!initial;

  const [businessName, setBusinessName] = useState(initial?.business_name ?? '');
  const [businessType, setBusinessType] = useState<Bot['business_type']>(initial?.business_type ?? 'other');
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phone_number_id ?? '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(initial?.owner_whatsapp ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '');
  const [hours, setHours] = useState(initial?.hours ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [services, setServices] = useState<Service[]>(
    (initial?.services ?? []).map((s) => ({ nombre: s.nombre, precio: s.precio, descripcion: s.descripcion ?? '' }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addService() {
    setServices((prev) => [...prev, emptyService()]);
  }

  function updateService(index: number, field: keyof Service, value: string) {
    setServices((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function removeService(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      businessName,
      businessType,
      ...(!isEdit && { phoneNumberId }),
      ownerWhatsapp: ownerWhatsapp || null,
      systemPrompt: systemPrompt || null,
      hours: hours || null,
      address: address || null,
      services: services.filter((s) => s.nombre.trim()).map((s) => ({
        nombre: s.nombre.trim(),
        precio: s.precio.trim(),
        ...(s.descripcion.trim() && { descripcion: s.descripcion.trim() }),
      })),
    };

    try {
      const url = isEdit
        ? `/api/admin/bots/${initial!.id}`
        : '/api/admin/bots';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al guardar');
        return;
      }

      router.push(`/admin/bots/${data.bot.id}`);
      router.refresh();
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">

      {/* Basic info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Información básica</h2>

        <div>
          <label className={labelCls}>Nombre del negocio *</label>
          <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
            required className={inputCls} placeholder="Ej: Restaurante El Rincón" />
        </div>

        <div>
          <label className={labelCls}>Tipo de negocio *</label>
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value as Bot['business_type'])}
            className={inputCls}>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {!isEdit && (
          <div>
            <label className={labelCls}>Phone Number ID (Meta) *</label>
            <input type="text" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
              required className={inputCls} placeholder="Ej: 1072423492622164" />
            <p className="text-xs text-gray-400 mt-1">
              Encuéntralo en Meta for Developers → WhatsApp → API Setup
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>WhatsApp del dueño</label>
          <input type="text" value={ownerWhatsapp} onChange={(e) => setOwnerWhatsapp(e.target.value)}
            className={inputCls} placeholder="Ej: 56912345678 (sin +)" />
          <p className="text-xs text-gray-400 mt-1">Recibe notificaciones de leads y agendamientos</p>
        </div>
      </section>

      {/* Context */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Contexto del negocio</h2>

        <div>
          <label className={labelCls}>Instrucciones para el bot</label>
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4} className={inputCls}
            placeholder="Ej: Eres el asistente virtual de El Rincón, un restaurante familiar en Santiago. Responde siempre en español, de forma cálida y concisa." />
        </div>

        <div>
          <label className={labelCls}>Horario de atención</label>
          <input type="text" value={hours} onChange={(e) => setHours(e.target.value)}
            className={inputCls} placeholder="Ej: Lunes a viernes 9:00–18:00, sábados 10:00–14:00" />
        </div>

        <div>
          <label className={labelCls}>Dirección</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            className={inputCls} placeholder="Ej: Av. Providencia 1234, Santiago" />
        </div>
      </section>

      {/* Services */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Servicios / Productos</h2>
          <button type="button" onClick={addService}
            className="text-sm text-blue-600 hover:underline">
            + Agregar
          </button>
        </div>

        {services.length === 0 && (
          <p className="text-xs text-gray-400">Sin servicios aún. Agrégalos para que el bot pueda cotizar y agendar.</p>
        )}

        {services.map((svc, i) => (
          <div key={i} className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
            <div className="flex gap-2">
              <input type="text" value={svc.nombre} onChange={(e) => updateService(i, 'nombre', e.target.value)}
                placeholder="Nombre del servicio *" className={`${inputCls} flex-1`} />
              <input type="text" value={svc.precio} onChange={(e) => updateService(i, 'precio', e.target.value)}
                placeholder="Precio (Ej: $15.000)" className="w-36 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={() => removeService(i)}
                className="text-gray-400 hover:text-red-500 px-1 text-lg">×</button>
            </div>
            <input type="text" value={svc.descripcion} onChange={(e) => updateService(i, 'descripcion', e.target.value)}
              placeholder="Descripción opcional" className={inputCls} />
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear bot'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2 border text-sm rounded hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
