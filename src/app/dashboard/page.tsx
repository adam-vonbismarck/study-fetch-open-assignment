"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronRight, ChevronLeft, Send, Upload } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import { useSession } from "next-auth/react"

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

type Message = {
  id: string
  content: string
  role: "user" | "ai"
  createdAt: string
}

type Study = {
  id: string
  title: string
  pdfUrl: string
  pdfName: string
  messages: Message[]
  createdAt: string
}

export default function Dashboard() {
  const { data: session } = useSession()
  const [isHistoryOpen, setIsHistoryOpen] = useState(true)
  const [studies, setStudies] = useState<Study[]>([])
  const [currentStudy, setCurrentStudy] = useState<Study | null>(null)
  const [inputMessage, setInputMessage] = useState("")
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchStudies()
  }, [])

  const fetchStudies = async () => {
    try {
      const response = await fetch("/api/study")
      const data = await response.json()
      if (data.studies) {
        setStudies(data.studies)
      }
    } catch (error) {
      console.error("Error fetching studies:", error)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/study", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()
      if (data.study) {
        setStudies([data.study, ...studies])
        setCurrentStudy(data.study)
      }
    } catch (error) {
      console.error("Error uploading file:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
  }

  const changePage = (offset: number) => {
    setPageNumber((prevPageNumber) => prevPageNumber + offset)
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentStudy) return

    try {
      const response = await fetch(`/api/study/${currentStudy.id}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: inputMessage }),
      })

      const data = await response.json()
      if (data.userMessage && data.aiMessage) {
        const updatedStudy = {
          ...currentStudy,
          messages: [...currentStudy.messages, data.userMessage, data.aiMessage],
        }
        setCurrentStudy(updatedStudy)
        setStudies(
          studies.map((study) =>
            study.id === currentStudy.id ? updatedStudy : study
          )
        )
        setInputMessage("")
      }
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  return (
    <div className="flex h-full">
      {/* History Sidebar */}
      <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen} className="bg-gray-800 h-full">
        <CollapsibleContent className="w-64 p-4 h-full overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Study History</h2>
          {studies.map((study) => (
            <div
              key={study.id}
              className={`cursor-pointer p-2 rounded mb-2 ${
                currentStudy?.id === study.id ? "bg-gray-700" : "hover:bg-gray-700"
              }`}
              onClick={() => setCurrentStudy(study)}
            >
              {study.title}
            </div>
          ))}
        </CollapsibleContent>
        {/*<CollapsibleTrigger asChild>*/}
        {/*  <Button variant="ghost" size="icon" className="absolute top-2 right-2">*/}
        {/*    {isHistoryOpen ? <ChevronLeft /> : <ChevronRight />}*/}
        {/*  </Button>*/}
        {/*</CollapsibleTrigger>*/}
      </Collapsible>

      {/* Main Content Area */}
      <div className="flex-1 flex h-full min-w-0">
        {/* PDF Viewer */}
        <div className="w-1/2 p-4 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            {currentStudy?.pdfUrl ? (
              <Document file={currentStudy.pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
                <Page pageNumber={pageNumber} />
              </Document>
            ) : (
              <div className="flex items-center justify-center h-full">
                <Card>
                  <CardContent className="flex flex-col items-center p-6">
                    <Upload className="w-12 h-12 mb-4 text-gray-400" />
                    <p className="mb-2">Upload a PDF to start studying</p>
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="max-w-xs"
                      disabled={isLoading}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
          {currentStudy?.pdfUrl && (
            <div className="flex justify-between mt-4">
              <Button onClick={() => changePage(-1)} disabled={pageNumber <= 1}>
                Previous
              </Button>
              <p>
                Page {pageNumber} of {numPages}
              </p>
              <Button onClick={() => changePage(1)} disabled={numPages !== null && pageNumber >= numPages}>
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="w-1/2 p-4 flex flex-col min-w-0">
          <Card className="flex-1 mb-4 overflow-hidden">
            <CardContent className="p-4 h-full overflow-y-auto">
              {currentStudy ? (
                currentStudy.messages.map((message) => (
                  <div key={message.id} className={`mb-2 ${message.role === "user" ? "text-right" : "text-left"}`}>
                    <span
                      className={`inline-block p-2 rounded ${message.role === "user" ? "bg-blue-600" : "bg-gray-700"}`}
                    >
                      {message.content}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400">Upload a PDF to start a new study session</p>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask a question about the PDF..."
              className="flex-1"
              disabled={!currentStudy}
            />
            <Button onClick={sendMessage} disabled={!currentStudy || !inputMessage.trim()}>
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
