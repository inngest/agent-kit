"use client";

import { useState } from "react";
import ImportModal from "@/components/ImportModal";
import ContactList from "@/components/ContactList";
import { Contact } from "@/types/contact";

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleImport = (importedContacts: Contact[]) => {
    setContacts((prev) => [...prev, ...importedContacts]);
    setIsModalOpen(false);
  };

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Contact Import
          </h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Import Contacts
          </button>
        </div>

        {isModalOpen && (
          <ImportModal
            onClose={() => setIsModalOpen(false)}
            onImport={handleImport}
          />
        )}

        <ContactList contacts={contacts} />
      </div>
    </main>
  );
}
