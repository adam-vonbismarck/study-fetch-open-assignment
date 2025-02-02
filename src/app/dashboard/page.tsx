"use client"

import {useEffect, useRef, useState} from "react"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Card, CardContent} from "@/components/ui/card"
import {Collapsible, CollapsibleContent} from "@/components/ui/collapsible"
import {ChevronLeft, ChevronRight, PenSquare, Send, Upload} from "lucide-react"
import {Document, Page} from "react-pdf"
import {useSession} from "next-auth/react"
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
// import {createEmbedding} from "@/lib/pdf-tools";
import {createEmbedding} from "@/lib/message-helpers";
import {pdfjs} from "react-pdf";
// Configure PDF.js worker
// pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.mjs';
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

type Message = {
  id: string
  content: string
  role: "user" | "ai"
  createdAt: string
}

type Study = {
  id: string
  title: string
  pdfKey: string
  pdfName: string
  pdfUrl: string
  messages?: Message[]
  createdAt: string
}

export default function Dashboard() {
  const {data: session} = useSession()
  const [isHistoryOpen, setIsHistoryOpen] = useState(true)
  const [studies, setStudies] = useState<Study[]>([])
  const [currentStudy, setCurrentStudy] = useState<Study | null>(null)
  const [inputMessage, setInputMessage] = useState("")
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [pageScale, setPageScale] = useState(1.0);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    fetchStudies()
  }, [])

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current && pdfDimensions) {
        const container = containerRef.current;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Calculate scale based on container dimensions
        // Subtract some padding (40px) to keep it from touching the edges
        const widthScale = (containerWidth - 40) / pdfDimensions.width;
        const heightScale = (containerHeight - 100) / pdfDimensions.height;

        // Use the smaller scale to ensure the page fits both dimensions
        const newScale = Math.min(widthScale, heightScale, 1.0);
        setPageScale(newScale);
      }
    };

    // Create resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      // Debounce the resize event
      resizeTimeoutRef.current = setTimeout(updateScale, 100);
    });

    // Start observing the container
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Initial scale update
    updateScale();

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [pdfDimensions]);

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

  const handleStudySelect = async (study: Study) => {
    try {
      setPdfUrl(study.pdfUrl)
      setCurrentStudy(study)
      setPageNumber(1)
      console.log(study.pdfUrl)
    } catch (error) {
      console.error("Error setting PDF URL:", error)
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
        // Store PDF in vector database
        await createEmbedding(data.study.pdfUrl, data.study.id, window.location.origin);

        setStudies([data.study, ...studies])
        setPdfUrl(data.study.pdfUrl)
        setCurrentStudy(data.study)
        setPageNumber(1)
      }
    } catch (error) {
      console.error("Error uploading file:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const onDocumentLoadSuccess = ({numPages}: { numPages: number }) => {
    setNumPages(numPages)
  }

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => {
      const newPage = prevPageNumber + offset
      if (newPage >= 1 && newPage <= (numPages || 1)) {
        return newPage
      }
      return prevPageNumber
    })
  }

  const startNewChat = () => {
    setCurrentStudy(null)
    setPdfUrl("")
    setInputMessage("")
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentStudy) return;

    try {
      setIsLoading(true);

      // Create a temporary message object for the user's message
      const userMessage = {
        id: Date.now().toString(),
        content: inputMessage,
        role: "user" as const,
        createdAt: new Date().toISOString(),
      };

      // Create a temporary message object for the AI's "thinking" message
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        content: "Thinking...",
        role: "ai" as const,
        createdAt: new Date().toISOString(),
      };

      // Update the UI with both messages
      const updatedStudy = {
        ...currentStudy,
        messages: [...(currentStudy.messages || []), userMessage, aiMessage],
      };
      setCurrentStudy(updatedStudy);
      setInputMessage("");

      // Prepare messages for the API
      const messageHistory = (currentStudy.messages || []).map(msg => ({
        role: msg.role === "ai" ? "assistant" : msg.role,
        content: msg.content,
      }));
      messageHistory.push({ role: "user", content: inputMessage });

      const response = await fetch(`/api/study/${currentStudy.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messageHistory,
          studyId: currentStudy.id
        }),
      });

      console.log(messageHistory);

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      if (data.highlightedPages && data.highlightedPages.length > 0) {
        setPdfUrl(data.highlightedPdfUrl);
      }

      if (data.highlightedPages && data.highlightedPages.length > 0) {
        setPageNumber(data.highlightedPages[0])
      }
      console.log(data.highlightedPages);

      // Update the AI message with the actual response
      const finalMessages = updatedStudy.messages.map(msg =>
        msg.id === aiMessage.id ? { ...msg, content: data.content } : msg
      );

      const finalStudy = {
        ...updatedStudy,
        messages: finalMessages,
      };

      setCurrentStudy(finalStudy);
      setStudies(studies.map((s) => (s.id === currentStudy.id ? finalStudy : s)));

    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const [pdfUrl, setPdfUrl] = useState("")

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* History Sidebar */}
      <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen} className="bg-gray-800">
        <CollapsibleContent className="w-64 p-4 h-full overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Study History</h2>
            <Button variant="ghost" size="icon" onClick={startNewChat} disabled={currentStudy == null}>
              <PenSquare className="h-5 w-5" />
            </Button>
          </div>
          {studies.map((study) => (
            <div
              key={study.id}
              className={`cursor-pointer p-2 rounded mb-2 ${
                currentStudy?.id === study.id ? "bg-gray-700" : "hover:bg-gray-700"
              }`}
              onClick={() => handleStudySelect(study)}
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
      <div className="flex-1 flex">
        {/* PDF Viewer */}
        <div className="w-1/2 p-4 flex flex-col min-h-0" ref={containerRef}>
          <div className="flex-1 overflow-auto relative">
            {pdfUrl ? (
              <>
                <Document
                  file={pdfUrl}
                  onLoadError={(error) => {
                    console.error('Error loading PDF:', error);
                    console.log('Attempted URL:', pdfUrl);
                  }}
                  onLoadSuccess={(pdf) => {
                    console.log('PDF loaded successfully');
                    setNumPages(pdf.numPages);
                  }}
                  loading={
                    <div className="flex justify-center items-center h-full">
                      <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"
                      ></div>
                    </div>
                  }
                  error={
                    <div className="flex justify-center items-center h-full text-red-500">
                      Error loading PDF. Please try again.
                    </div>
                  }
                  className="flex justify-center"
                >
                  {numPages > 0 && (
                    <div className="w-full flex justify-center">
                      <Page
                        pageNumber={pageNumber}
                        scale={pageScale}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        onLoadSuccess={(page) => {
                          setPdfDimensions({
                            width: page.originalWidth,
                            height: page.originalHeight
                          });
                        }}
                  />
                    </div>
                  )}
                </Document>
                {numPages > 0 && (
                  <div
                    className="flex justify-center items-center gap-4 mt-4 sticky bottom-0 p-2"
                    style={{gap: "1rem"}}>
                    <Button
                      onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                      disabled={pageNumber <= 1}
                      variant="secondary"
                    >
                      <ChevronLeft className="h-4 w-4"/>
                    </Button>
                    <div>
                      <span>
                        Page {pageNumber} of {numPages}
                      </span>
                    </div>
                    <Button
                      onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                      disabled={pageNumber >= numPages}
                      variant="secondary"
                    >
                      <ChevronRight className="h-4 w-4"/>
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <Card>
                  <CardContent className="flex flex-col items-center p-6">
                    <Upload className="w-12 h-12 mb-4 text-gray-400"/>
                    <p className="mb-2">No PDF uploaded</p>
                    <Input type="file" accept=".pdf" onChange={handleFileChange} className="max-w-xs"/>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="w-1/2 p-4 flex flex-col">
          <Card className="flex-1 mb-4 overflow-hidden">
            <CardContent className="p-4 h-full overflow-y-auto">
              {currentStudy ? (
                currentStudy.messages?.length ? (
                  currentStudy.messages.map((message) => (
                    <div key={message.id} className={`mb-2 ${message.role === "user" ? "text-right" : "text-left"}`}>
                      <div
                        className={`inline-block p-2 rounded ${
                          message.role === "user" ? "bg-blue-600" : "bg-gray-700"
                        } max-w-[80%] overflow-x-auto text-left`}
                      >
                        {message.role === "user" ? (
                          <span>{message.content}</span>
                        ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({children}) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                            li: ({children}) => <li className="mb-1">{children}</li>,
                            code: ({inline, children}) => 
                              inline ? (
                                <code className="bg-gray-800 px-1 rounded">{children}</code>
                              ) : (
                                <pre className="bg-gray-800 p-2 rounded overflow-x-auto">
                                  <code>{children}</code>
                                </pre>
                              )
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">Start chatting about your PDF!</p>
                  </div>
                )
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
              disabled={!currentStudy || isLoading}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <Button onClick={sendMessage} disabled={!currentStudy || !inputMessage.trim() || isLoading}>
              <Send className="w-4 h-4 mr-2"/>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}