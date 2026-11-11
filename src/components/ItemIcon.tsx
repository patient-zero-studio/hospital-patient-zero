import React from 'react';
import { Key, KeyRound, CreditCard, Zap, BatteryCharging, HeartPulse, FileText, Disc, FileCheck, Flashlight, Package, CupSoda, Syringe, Hammer, Cookie, AlarmClock, Wrench } from 'lucide-react';

/** Icon for an inventory item, shared by the hotbar and the inventory screen. */
export const ItemIcon: React.FC<{ icon: string; className?: string }> = ({ icon, className = 'w-6 h-6' }) => {
  switch (icon) {
    case 'Key':
      return <Key className={`${className} text-amber-400`} />;
    case 'KeyRound':
      return <KeyRound className={`${className} text-amber-500`} />;
    case 'CreditCard':
      return <CreditCard className={`${className} text-blue-400`} />;
    case 'Zap':
      return <Zap className={`${className} text-yellow-400`} />;
    case 'BatteryCharging':
      return <BatteryCharging className={`${className} text-emerald-400`} />;
    case 'HeartPulse':
      return <HeartPulse className={`${className} text-red-400`} />;
    case 'FileText':
      return <FileText className={`${className} text-zinc-300`} />;
    case 'Disc':
      return <Disc className={`${className} text-purple-400`} />;
    case 'FileCheck':
      return <FileCheck className={`${className} text-cyan-400`} />;
    case 'Syringe':
      return <Syringe className={`${className} text-lime-300`} />;
    case 'CupSoda':
      return <CupSoda className={`${className} text-red-400`} />;
    case 'Planks':
      return <Hammer className={`${className} text-amber-600`} />;
    case 'Cookie':
      return <Cookie className={`${className} text-amber-300`} />;
    case 'AlarmClock':
      return <AlarmClock className={`${className} text-red-400`} />;
    case 'Wrench':
      return <Wrench className={`${className} text-zinc-300`} />;
    case 'Flashlight':
      return <Flashlight className={`${className} text-orange-400`} />;
    default:
      return <Package className={`${className} text-zinc-400`} />;
  }
};
