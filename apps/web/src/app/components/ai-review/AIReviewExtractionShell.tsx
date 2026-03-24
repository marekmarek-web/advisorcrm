"use client";

import React, { useReducer, useCallback, useEffect } from "react";
import { FileText, Eye } from "lucide-react";
import type {
  ExtractionDocument,
  ExtractionReviewState,
  ExtractionReviewAction,
  AIRecommendation,
  FieldFilter,
} from "@/lib/ai-review/types";
import { AIReviewTopBar } from "./AIReviewTopBar";
import { ExtractionLeftPanel } from "./ExtractionLeftPanel";
import { PDFViewerPanel } from "./PDFViewerPanel";

const initialState: ExtractionReviewState = {
  activeFieldId: null,
  activePage: 1,
  zoomLevel: 100,
  filter: "all",
  collapsedGroups: {},
  dismissedRecommendations: {},
  editedFields: {},
  confirmedFields: {},
  isFullscreen: false,
  showPdfOnMobile: false,
};

function reducer(
  state: ExtractionReviewState,
  action: ExtractionReviewAction
): ExtractionReviewState {
  switch (action.type) {
    case "SET_ACTIVE_FIELD":
      return {
        ...state,
        activeFieldId: action.fieldId,
        activePage: action.page ?? state.activePage,
      };
    case "SET_PAGE":
      return { ...state, activePage: action.page };
    case "SET_ZOOM":
      return { ...state, zoomLevel: action.level };
    case "SET_FILTER":
      return { ...state, filter: action.filter };
    case "TOGGLE_GROUP":
      return {
        ...state,
        collapsedGroups: {
          ...state.collapsedGroups,
          [action.groupId]: !state.collapsedGroups[action.groupId],
        },
      };
    case "DISMISS_RECOMMENDATION":
      return {
        ...state,
        dismissedRecommendations: {
          ...state.dismissedRecommendations,
          [action.recId]: true,
        },
      };
    case "RESTORE_RECOMMENDATION": {
      const next = { ...state.dismissedRecommendations };
      delete next[action.recId];
      return { ...state, dismissedRecommendations: next };
    }
    case "EDIT_FIELD":
      return {
        ...state,
        editedFields: { ...state.editedFields, [action.fieldId]: action.value },
      };
    case "CONFIRM_FIELD":
      return {
        ...state,
        confirmedFields: { ...state.confirmedFields, [action.fieldId]: true },
      };
    case "REVERT_FIELD": {
      const nextEdited = { ...state.editedFields };
      delete nextEdited[action.fieldId];
      const nextConfirmed = { ...state.confirmedFields };
      delete nextConfirmed[action.fieldId];
      return { ...state, editedFields: nextEdited, confirmedFields: nextConfirmed };
    }
    case "SET_FULLSCREEN":
      return { ...state, isFullscreen: action.isFullscreen };
    case "SET_SHOW_PDF_MOBILE":
      return { ...state, showPdfOnMobile: action.show };
    default:
      return state;
  }
}

type Props = {
  doc: ExtractionDocument;
  onBack: () => void;
  onDiscard: () => void;
  onApprove: () => void;
  isApproving?: boolean;
};

export function AIReviewExtractionShell({
  doc,
  onBack,
  onDiscard,
  onApprove,
  isApproving,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isFullscreen) {
        dispatch({ type: "SET_FULLSCREEN", isFullscreen: false });
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [state.isFullscreen]);

  const handleFieldClick = useCallback(
    (fieldId: string, page?: number) => {
      dispatch({ type: "SET_ACTIVE_FIELD", fieldId, page });
    },
    []
  );

  const handleHighlightClick = useCallback(
    (fieldId: string) => {
      dispatch({ type: "SET_ACTIVE_FIELD", fieldId });
    },
    []
  );

  const handleEdit = useCallback(
    (fieldId: string, value: string) => {
      dispatch({ type: "EDIT_FIELD", fieldId, value });
    },
    []
  );

  const handleConfirm = useCallback(
    (fieldId: string) => {
      dispatch({ type: "CONFIRM_FIELD", fieldId });
    },
    []
  );

  const handleRevert = useCallback(
    (fieldId: string) => {
      dispatch({ type: "REVERT_FIELD", fieldId });
    },
    []
  );

  const handleFilterChange = useCallback(
    (filter: FieldFilter) => {
      dispatch({ type: "SET_FILTER", filter });
    },
    []
  );

  const handleToggleGroup = useCallback(
    (groupId: string) => {
      dispatch({ type: "TOGGLE_GROUP", groupId });
    },
    []
  );

  const handleDismissRec = useCallback(
    (id: string) => {
      dispatch({ type: "DISMISS_RECOMMENDATION", recId: id });
    },
    []
  );

  const handleRestoreRec = useCallback(
    (id: string) => {
      dispatch({ type: "RESTORE_RECOMMENDATION", recId: id });
    },
    []
  );

  const handleCreateTask = useCallback(
    (_rec: AIRecommendation) => {
      // TODO: wire to actual task creation flow
    },
    []
  );

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans text-slate-800 overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800;900&display=swap');
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
      `}</style>

      <AIReviewTopBar
        doc={doc}
        onBack={onBack}
        onDiscard={onDiscard}
        onApprove={onApprove}
        isApproving={isApproving}
      />

      {/* Mobile tab switcher */}
      <div className="lg:hidden flex border-b border-slate-200 bg-white">
        <button
          onClick={() => dispatch({ type: "SET_SHOW_PDF_MOBILE", show: false })}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center transition-colors ${
            !state.showPdfOnMobile
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-slate-500"
          }`}
        >
          <FileText size={14} className="inline-block mr-1.5 -mt-0.5" />
          Extrakce
        </button>
        <button
          onClick={() => dispatch({ type: "SET_SHOW_PDF_MOBILE", show: true })}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center transition-colors ${
            state.showPdfOnMobile
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-slate-500"
          }`}
        >
          <Eye size={14} className="inline-block mr-1.5 -mt-0.5" />
          PDF Náhled
        </button>
      </div>

      <main className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <section
          className={`w-full lg:w-[55%] flex flex-col bg-[#f4f7f9] border-r border-slate-200 ${
            state.showPdfOnMobile ? "hidden lg:flex" : "flex"
          }`}
        >
          <ExtractionLeftPanel
            doc={doc}
            state={state}
            onFieldClick={handleFieldClick}
            onEdit={handleEdit}
            onConfirm={handleConfirm}
            onRevert={handleRevert}
            onFilterChange={handleFilterChange}
            onToggleGroup={handleToggleGroup}
            onDismissRec={handleDismissRec}
            onRestoreRec={handleRestoreRec}
            onCreateTask={handleCreateTask}
          />
        </section>

        {/* Right panel */}
        <aside
          className={`w-full lg:w-[45%] flex flex-col ${
            state.showPdfOnMobile ? "flex" : "hidden lg:flex"
          }`}
        >
          <PDFViewerPanel
            doc={doc}
            activeFieldId={state.activeFieldId}
            activePage={state.activePage}
            zoomLevel={state.zoomLevel}
            isFullscreen={state.isFullscreen}
            onZoomChange={(level) => dispatch({ type: "SET_ZOOM", level })}
            onPageChange={(page) => dispatch({ type: "SET_PAGE", page })}
            onFullscreenToggle={() =>
              dispatch({ type: "SET_FULLSCREEN", isFullscreen: !state.isFullscreen })
            }
            onHighlightClick={handleHighlightClick}
          />
        </aside>
      </main>
    </div>
  );
}
