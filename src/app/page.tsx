"use client";

import { useState, useRef } from "react";
import {
  Upload,
  FileText,
  Brain,
  Search,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Download,
  Eye,
} from "lucide-react";

interface AnalysisResult {
  type: string;
  content: string;
  timestamp: Date;
}

export default function LegalDocumentAnalyzer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [".pdf", ".doc", ".docx", ".txt"];
      const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();

      if (allowedTypes.includes(fileExtension)) {
        setSelectedFile(file);
        setUploadSuccess(false);
        setAnalysisResults([]);
      } else {
        alert("Please select a valid document file (.pdf, .doc, .docx, .txt)");
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("document", selectedFile);

      const response = await fetch("/api/upload-document", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setUploadSuccess(true);
        console.log("Upload successful:", result);
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(
        `Failed to upload document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalysis = async (analysisType: string) => {
    if (!selectedFile || !uploadSuccess) {
      alert("Please upload a document first");
      return;
    }

    setIsAnalyzing(analysisType);

    try {
      const response = await fetch("/api/analyze-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisType,
          fileName: selectedFile.name,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const newAnalysis: AnalysisResult = {
          type: analysisType,
          content: result.analysis,
          timestamp: new Date(),
        };
        setAnalysisResults((prev) => [...prev, newAnalysis]);
      } else {
        throw new Error(result.error || "Analysis failed");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      alert(
        `Failed to perform ${formatAnalysisType(analysisType)}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsAnalyzing(null);
    }
  };

  const formatAnalysisType = (type: string) => {
    switch (type) {
      case "summarize":
        return "Document Summary";
      case "detailed":
        return "Detailed Analysis";
      case "risks":
        return "Risk Assessment";
      case "key-terms":
        return "Key Terms & Clauses";
      case "plain-english":
        return "Plain English Translation";
      default:
        return type;
    }
  };

  const getAnalysisIcon = (type: string) => {
    switch (type) {
      case "summarize":
        return <FileText className="w-5 h-5" />;
      case "detailed":
        return <Brain className="w-5 h-5" />;
      case "risks":
        return <AlertTriangle className="w-5 h-5" />;
      case "key-terms":
        return <Search className="w-5 h-5" />;
      case "plain-english":
        return <Eye className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Legal Document Analyzer
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Upload your legal documents and get clear, accessible insights
            powered by AI. Understand complex terms, identify risks, and make
            informed decisions.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <Upload className="w-6 h-6 mr-2 text-blue-600" />
                Upload Document
              </h2>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {selectedFile ? (
                    <div className="space-y-2">
                      <FileText className="w-12 h-12 text-blue-600 mx-auto" />
                      <p className="font-medium text-gray-800">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                      <p className="text-gray-600">
                        Click to select a document
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports PDF, DOC, DOCX, TXT
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {selectedFile ? "Change File" : "Select File"}
                  </button>
                </div>

                {selectedFile && !uploadSuccess && (
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        Upload Document
                      </>
                    )}
                  </button>
                )}

                {uploadSuccess && (
                  <div className="flex items-center justify-center text-green-600 bg-green-50 p-3 rounded-lg">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Document uploaded successfully!
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Options */}
            {uploadSuccess && (
              <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Analysis Options
                </h2>

                <div className="space-y-3">
                  <button
                    onClick={() => handleAnalysis("summarize")}
                    disabled={isAnalyzing !== null}
                    className="w-full p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left flex items-center transition-colors disabled:opacity-50"
                  >
                    {isAnalyzing === "summarize" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin text-blue-600" />
                    ) : (
                      <FileText className="w-5 h-5 mr-3 text-blue-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800">Quick Summary</p>
                      <p className="text-sm text-gray-600">
                        Get the key points in simple terms
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAnalysis("detailed")}
                    disabled={isAnalyzing !== null}
                    className="w-full p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left flex items-center transition-colors disabled:opacity-50"
                  >
                    {isAnalyzing === "detailed" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin text-purple-600" />
                    ) : (
                      <Brain className="w-5 h-5 mr-3 text-purple-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800">
                        Detailed Analysis
                      </p>
                      <p className="text-sm text-gray-600">
                        Comprehensive breakdown of all sections
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAnalysis("risks")}
                    disabled={isAnalyzing !== null}
                    className="w-full p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-left flex items-center transition-colors disabled:opacity-50"
                  >
                    {isAnalyzing === "risks" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin text-red-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 mr-3 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800">
                        Risk Assessment
                      </p>
                      <p className="text-sm text-gray-600">
                        Identify potential legal and financial risks
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAnalysis("key-terms")}
                    disabled={isAnalyzing !== null}
                    className="w-full p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-left flex items-center transition-colors disabled:opacity-50"
                  >
                    {isAnalyzing === "key-terms" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin text-green-600" />
                    ) : (
                      <Search className="w-5 h-5 mr-3 text-green-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800">
                        Key Terms & Clauses
                      </p>
                      <p className="text-sm text-gray-600">
                        Important terms explained clearly
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAnalysis("plain-english")}
                    disabled={isAnalyzing !== null}
                    className="w-full p-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-left flex items-center transition-colors disabled:opacity-50"
                  >
                    {isAnalyzing === "plain-english" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin text-orange-600" />
                    ) : (
                      <Eye className="w-5 h-5 mr-3 text-orange-600" />
                    )}
                    <div>
                      <p className="font-medium text-gray-800">
                        Plain English Translation
                      </p>
                      <p className="text-sm text-gray-600">
                        Convert legal jargon to everyday language
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Analysis Results
              </h2>

              {analysisResults.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    Upload a document and run an analysis to see results here
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {analysisResults.map((result, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          {getAnalysisIcon(result.type)}
                          <h3 className="text-lg font-medium text-gray-800 ml-2">
                            {formatAnalysisType(result.type)}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">
                            {result.timestamp.toLocaleTimeString()}
                          </span>
                          <button className="p-2 text-gray-400 hover:text-gray-600 rounded">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="prose max-w-none">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                            {result.content}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>
            This tool provides general information and should not replace
            professional legal advice. Always consult with a qualified attorney
            for specific legal matters.
          </p>
        </div>
      </div>
    </div>
  );
}
