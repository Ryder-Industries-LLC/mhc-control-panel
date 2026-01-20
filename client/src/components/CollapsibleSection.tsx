import React, { useState } from 'react';

export interface CollapsibleSectionProps {
  title: React.ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
  /** Optional action buttons to display in the header (e.g., "Add" button) */
  actions?: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultCollapsed = true,
  className = '',
  headerClassName = '',
  contentClassName = '',
  children,
  actions,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`border border-white/10 rounded-lg overflow-hidden ${className}`}>
      <div className={`w-full p-4 flex justify-between items-center bg-white/5 ${headerClassName}`}>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex justify-between items-center hover:bg-white/5 -m-2 p-2 rounded transition-colors cursor-pointer"
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
        {actions && (
          <div className="ml-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>

      <div
        className={`transition-all duration-200 ease-in-out ${
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[20000px] opacity-100'
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
