import React, { useState } from 'react';

export interface CollapsibleSectionProps {
  title: string;
  defaultCollapsed?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultCollapsed = true,
  className = '',
  headerClassName = '',
  contentClassName = '',
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`border border-white/10 rounded-lg overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full p-4 flex justify-between items-center bg-white/5 hover:bg-white/10 transition-colors cursor-pointer ${headerClassName}`}
      >
        <h3 className="text-lg font-semibold text-white m-0">{title}</h3>
        <svg
          className={`w-5 h-5 text-white/60 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`transition-all duration-200 ease-in-out ${
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
        } overflow-hidden`}
      >
        <div className={`p-4 ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleSection;
