import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  unit?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ label, id, error, unit, ...props }, ref) => {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="mt-1 relative rounded-md shadow-sm">
        {unit && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">{unit}</span>
            </div>
        )}
        <input
          id={id}
          ref={ref}
          className={`appearance-none block w-full py-2 border rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white ${error ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'} ${unit ? 'pl-12 pr-3' : 'px-3'}`}
          {...props}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;