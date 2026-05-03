import React, { createContext, useContext, useState } from 'react';

type Language = 'uz' | 'ru';

export const translations = {
  uz: {
    materials: 'Materiallar',
    users: 'Foydalanuvchilar',
    projects: 'Obyektlar',
    requisitions: 'Zayavkalar',
    reports: 'Texnik hisobot (M-29)',
    waybills: 'Nakladnoylar',
    inventory: 'Ombor Inventari',
    invoices: 'Shet-Fakturalar',
    logout: 'Chiqish',
    login: 'Kirish',
    pending: 'Tasdiqlanishini kuting',
    role: 'Lavozim',
    email: 'Email manzili',
    password: 'Maxfiy parol',
    compare: 'Solishtirish (Excel)',
    import: 'Exceldan import',
    balance: 'Qoldiq',
    totalIn: 'Kirish',
    totalOut: 'Chiqish',
    'ADMIN': 'Administrator',
    'FOREMAN': 'Pro-rab',
    'WAREHOUSE': 'Sklad',
    'PTO': 'PTO',
    'CHIEF_ENGINEER': 'Gl. muhandis',
    'ACCOUNTING': 'Buxgalteriya',
    'SUPPLY': 'Snabjeniye',
    'MANAGEMENT': 'Rukovodstvo'
  },
  ru: {
    materials: 'Материалы',
    users: 'Пользователи',
    projects: 'Объекты',
    requisitions: 'Заявки',
    reports: 'Тех. отчет (M-29)',
    waybills: 'Накладные',
    inventory: 'Остатки на складе',
    invoices: 'Счета/Фактуры',
    logout: 'Выйти',
    login: 'Войти',
    pending: 'Ожидайте подтверждения',
    role: 'Должность',
    email: 'Электронная почта',
    password: 'Пароль',
    compare: 'Сравнение (Excel)',
    import: 'Импорт из Excel',
    balance: 'Остаток',
    totalIn: 'Приход',
    totalOut: 'Расход',
    'ADMIN': 'Администратор',
    'FOREMAN': 'Прораб',
    'WAREHOUSE': 'Склад',
    'PTO': 'ПТО',
    'CHIEF_ENGINEER': 'Гл. инж.',
    'ACCOUNTING': 'Бухгалтерия',
    'SUPPLY': 'Снабжение',
    'MANAGEMENT': 'Руководство'
  }
};

interface LanguageContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: keyof typeof translations['uz']) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'uz',
  setLang: () => {},
  t: (key) => translations['uz'][key]
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('erp_lang') as Language) || 'uz');

  const handleSetLang = (l: Language) => {
    setLang(l);
    localStorage.setItem('erp_lang', l);
  };

  const t = (key: keyof typeof translations['uz']) => translations[lang][key] || key;

  return (
    <LanguageContext.Provider value={{ lang, setLang: handleSetLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
