/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Contact, ImportStep } from "@/types/contact";
import FileUpload from "./FileUpload";
import { importContacts } from "@/actions";
import { getRuns } from "@/inngest/utils";
interface ImportModalProps {
  onClose: () => void;
  onImport: (contacts: Contact[]) => void;
}

function CSVToObject(csv: string) {
  const lines = csv.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const data = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index];
      return acc;
    }, {} as Record<string, string>);
  });
  return data;
}

const IDENTIFY_FIELDS = ["fullName", "email"];
const MAP_FIELDS = IDENTIFY_FIELDS.concat(["position", "company", "ranking"]);

export default function ImportModal({ onClose, onImport }: ImportModalProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [mappedContacts, setMappedContacts] = useState<Contact[]>([]);
  const [rankingCriteria, setRankingCriteria] = useState<string>("");

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    const text = await selectedFile.text();
    const { ids: runIds } = await importContacts(CSVToObject(text));
    setRunId(runIds[0]);
    setStep("mapping");
  };

  useEffect(() => {
    if (runId) {
      const interval = setInterval(() => {
        getRuns(runId).then((runs) => {
          if (["Completed", "Failed"].includes(runs[0].status)) {
            clearInterval(interval);
            setStep("import");
            setMappedContacts(runs[0].output as any);
          }
        });
      }, 1000);
    }
  }, [runId]);

  const handleNext = async () => {
    if (step === "mapping") {
      setStep("import");
    } else if (step === "import" && file) {
      try {
        onImport(mappedContacts);
      } catch (error) {
        console.error("Error importing contacts:", error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-800">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-100">
              {step === "upload" && "Upload a CSV file"}
              {step === "mapping" && "Mapping contacts"}
              {step === "import" && "Import contacts"}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {step === "upload" &&
                "Make sure the file includes contact information"}
              {step === "mapping" &&
                "Contacts mapping is being processed, please wait..."}
              {step === "import" &&
                "Ensure that the information is mapped correctly"}
            </p>
          </div>

          {/* Content */}
          <div className="mb-6">
            {step === "upload" && (
              <div>
                <FileUpload onFileSelect={handleFileSelect} />
                <div className="mt-4">
                  <label className="text-sm text-gray-400">
                    Rank contacts based on:
                  </label>
                  <input
                    type="text"
                    value={rankingCriteria}
                    placeholder="e.g. job title, company, location"
                    onChange={(e) => setRankingCriteria(e.target.value)}
                    className="w-full p-2 rounded-md border border-gray-700 bg-gray-800 text-gray-100"
                  />
                </div>
              </div>
            )}

            {step === "mapping" && (
              <div className="mt-6">
                <div className="flex justify-center items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              </div>
            )}

            {step === "import" && mappedContacts.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Preview
                </h3>
                <div className="border border-gray-700 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                      <tr>
                        {MAP_FIELDS.map((header) => (
                          <th
                            key={header}
                            className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-gray-900 divide-y divide-gray-800">
                      {mappedContacts.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {Object.values(row).map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-3 py-2 text-sm text-gray-300 whitespace-nowrap"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3">
            <button
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-100 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            {step !== "upload" && (
              <button
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                onClick={handleNext}
                disabled={step === "mapping" && mappedContacts.length === 0}
              >
                {step === "import" ? "Import" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
