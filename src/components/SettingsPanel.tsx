import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MeasureData } from '../types';
import { ConditionalFormattingRule } from '../types/conditionalFormatting';
import ReorderMeasuresModal from './ReorderMeasuresModal';
import ReadOnlyMeasuresDetailsModal from './ReadOnlyMeasuresDetailsModal';
import ConditionalFormattingTab from './ConditionalFormattingTab';
import { getMockData } from '../data/mockData';
import { adjustmentMeasuresData } from '../data/adjustmentMeasuresData';
import { useIndustry } from '../contexts/IndustryContext';
// Icon imports - using public folder paths (SVGs with built-in colored backgrounds)
const AccountIcon = '/new_account.svg';
const CategoryIcon = '/category.svg';
const ProductIcon = '/product.svg';
import '../styles/components/SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDimensionLevels: Set<string>;
  onDimensionLevelsChange: (levels: Set<string>) => void;
  selectedTimeGranularities: Set<string>;
  onTimeGranularitiesChange: (granularities: Set<string>) => void;
  columnWidth: number; // Column width in pixels
  onColumnWidthChange: (width: number) => void;
  onExpandAllRows?: () => void;
  onCollapseAllRows?: () => void;
  selectedMeasureSubgroup?: Set<string>;
  onMeasureSubgroupChange?: (subgroups: Set<string>) => void;
  selectedLayout?: string;
  onLayoutChange?: (layout: string) => void;
  measures?: MeasureData[]; // Current measures data
  onMeasuresReorder?: (orderedMeasures: MeasureData[], visibleMeasureIds: Set<string>) => void; // Callback when measures are reordered
  visibleMeasureIds?: Set<string>; // Set of visible measure IDs
  showAllPeriods?: boolean;
  onShowAllPeriodsChange?: (showAll: boolean) => void;
  startPeriod?: string;
  endPeriod?: string;
  onStartPeriodChange?: (period: string) => void;
  onEndPeriodChange?: (period: string) => void;
  showAdditionalFrozenColumns?: boolean;
  onShowAdditionalFrozenColumnsChange?: (show: boolean) => void;
  showSubColumns?: boolean;
  onShowSubColumnsChange?: (show: boolean) => void;
  onEditFrozenColumns?: () => void;
  onEditSubColumns?: () => void;
  conditionalFormattingRules?: ConditionalFormattingRule[];
  onConditionalFormattingRulesChange?: (rules: ConditionalFormattingRule[]) => void;
  onConditionalFormattingPreviewChange?: (rule: ConditionalFormattingRule | null) => void;
  applyCfRulesAsColorScale?: boolean;
  onApplyCfRulesAsColorScaleChange?: (enabled: boolean) => void;
  selectedCellKey?: string | null;
  designSystemRulesEnabled?: boolean;
  onDesignSystemRulesChange?: (enabled: boolean) => void;
  forceFormattingTabSignal?: number;
  cfLaunchFromSelectionSignal?: number;
  cfLaunchFromSelectionCellKeys?: string[];
}

const layoutOptions = [
  {
    value: 'Measures / Dimensions x Time',
    subtitle: 'Measures, Dimensions in Rows, Time in columns'
  },
  {
    value: 'Dimensions / Time x Measures',
    subtitle: 'Dimension, Time in Rows, Measures in columns'
  },
  {
    value: 'Time / Dimensions x Measures',
    subtitle: 'Time, Dimension in Rows, Measures in columns'
  }
];

const measureSubgroupOptions = [
  {
    value: 'Revenue & Quantity Measures'
  },
  {
    value: 'Adjustment Measures'
  }
];

interface DimensionLevel {
  id: string;
  name: string;
  hierarchy: string;
}

const dimensionLevels: DimensionLevel[] = [
  { id: 'account', name: 'Accounts', hierarchy: 'Account Hierarchy' },
  { id: 'category', name: 'Category', hierarchy: 'Product Hierarchy' },
  { id: 'product', name: 'Product', hierarchy: 'Product Hierarchy' }
];

interface TimeGranularity {
  id: string;
  name: string;
}

const timeGranularities: TimeGranularity[] = [
  { id: 'year', name: 'Years' },
  { id: 'quarter', name: 'Quarters' },
  { id: 'month', name: 'Months' }
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  isOpen, 
  onClose, 
  selectedDimensionLevels, 
  onDimensionLevelsChange,
  selectedTimeGranularities,
  onTimeGranularitiesChange,
  columnWidth,
  onColumnWidthChange,
  onExpandAllRows,
  onCollapseAllRows,
  selectedMeasureSubgroup: propSelectedMeasureSubgroup,
  onMeasureSubgroupChange,
  selectedLayout: propSelectedLayout,
  onLayoutChange,
  measures = [],
  onMeasuresReorder,
  visibleMeasureIds = new Set(),
  showAllPeriods = true,
  onShowAllPeriodsChange,
  startPeriod = '',
  endPeriod = '',
  onStartPeriodChange,
  onEndPeriodChange,
  showAdditionalFrozenColumns: propShowAdditionalFrozenColumns = false,
  onShowAdditionalFrozenColumnsChange,
  showSubColumns: propShowSubColumns = false,
  onShowSubColumnsChange,
  onEditFrozenColumns,
  onEditSubColumns,
  conditionalFormattingRules = [],
  onConditionalFormattingRulesChange,
  onConditionalFormattingPreviewChange,
  applyCfRulesAsColorScale = false,
  onApplyCfRulesAsColorScaleChange,
  selectedCellKey = null,
  designSystemRulesEnabled = true,
  onDesignSystemRulesChange,
  forceFormattingTabSignal = 0,
  cfLaunchFromSelectionSignal = 0,
  cfLaunchFromSelectionCellKeys = []
}) => {
  const { industry } = useIndustry();
  const [selectedLayout, setSelectedLayout] = useState(propSelectedLayout || layoutOptions[0].value);
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedMeasureSubgroup, setSelectedMeasureSubgroup] = useState<Set<string>>(
    propSelectedMeasureSubgroup || new Set([measureSubgroupOptions[0].value])
  );
  const [isMeasureSubgroupDropdownOpen, setIsMeasureSubgroupDropdownOpen] = useState(false);
  const measureSubgroupDropdownRef = useRef<HTMLDivElement>(null);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [isReadOnlyDetailsModalOpen, setIsReadOnlyDetailsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'layout' | 'formatting' | 'shortcuts'>('layout');
  const [enableKeyboardShortcuts, setEnableKeyboardShortcuts] = useState(true);
  const [enableRightClickMenuOptions, setEnableRightClickMenuOptions] = useState(true);


  // Sync internal state with props
  useEffect(() => {
    if (propSelectedMeasureSubgroup !== undefined) {
      setSelectedMeasureSubgroup(new Set(propSelectedMeasureSubgroup));
    }
  }, [propSelectedMeasureSubgroup]);

  useEffect(() => {
    if (propSelectedLayout !== undefined) {
      setSelectedLayout(propSelectedLayout);
    }
  }, [propSelectedLayout]);

  useEffect(() => {
    if (!isOpen) return;
    if (forceFormattingTabSignal > 0) {
      setActiveTab('formatting');
    }
  }, [isOpen, forceFormattingTabSignal]);
  
  const [isDimensionDropdownOpen, setIsDimensionDropdownOpen] = useState(false);
  const dimensionDropdownRef = useRef<HTMLDivElement>(null);
  
  const [isTimeGranularityDropdownOpen, setIsTimeGranularityDropdownOpen] = useState(false);
  const timeGranularityDropdownRef = useRef<HTMLDivElement>(null);
  
  const [showAdditionalFrozenColumns, setShowAdditionalFrozenColumns] = useState(propShowAdditionalFrozenColumns);
  const [showSubColumns, setShowSubColumns] = useState(propShowSubColumns);
  
  // Sync internal state with props
  useEffect(() => {
    if (propShowAdditionalFrozenColumns !== undefined) {
      setShowAdditionalFrozenColumns(propShowAdditionalFrozenColumns);
    }
  }, [propShowAdditionalFrozenColumns]);
  
  useEffect(() => {
    if (propShowSubColumns !== undefined) {
      setShowSubColumns(propShowSubColumns);
    }
  }, [propShowSubColumns]);
  
  // Column width slider state
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  
  // Get slider range based on selected layout
  const getSliderRange = (): { min: number; max: number } => {
    if (selectedLayout === 'Dimensions / Time x Measures' || selectedLayout === 'Time / Dimensions x Measures') {
      return { min: 50, max: 300 }; // Range for measure columns
    }
    // Default range for "Measures / Dimensions x Time" (time period columns)
    return { min: 50, max: 200 };
  };
  
  const sliderRange = getSliderRange();
  
  // Convert pixel width to slider value (1-100) based on current layout's range
  const pixelToSliderValue = (pixels: number): number => {
    const { min, max } = sliderRange;
    // Map min to 1, max to 100
    return 1 + ((pixels - min) / (max - min)) * 99;
  };
  
  // Convert slider value (1-100) to pixel width based on current layout's range
  const sliderValueToPixel = (value: number): number => {
    const { min, max } = sliderRange;
    // Map 1 to min, 100 to max
    return min + ((value - 1) / 99) * (max - min);
  };
  
  const sliderValue = Math.round(pixelToSliderValue(columnWidth));
  
  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !sliderRef.current) return;
      
      const rect = sliderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // Map to 1-100 scale
      const sliderVal = Math.max(1, Math.min(100, Math.round(1 + (x / rect.width) * 99)));
      const newWidth = sliderValueToPixel(sliderVal);
      onColumnWidthChange(Math.round(newWidth));
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onColumnWidthChange, sliderRange]);
  
  const handleSliderClick = (e: React.MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // Map to 1-100 scale
    const sliderVal = Math.max(1, Math.min(100, Math.round(1 + (x / rect.width) * 99)));
    const newWidth = sliderValueToPixel(sliderVal);
    onColumnWidthChange(Math.round(newWidth));
  };

  // Reset column width to 50% of slider range for current layout
  const handleResetColumnWidth = () => {
    const defaultWidth = sliderRange.min + (sliderRange.max - sliderRange.min) * 0.5;
    onColumnWidthChange(defaultWidth);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(event.target as Node)) {
        setIsLayoutDropdownOpen(false);
      }
      if (measureSubgroupDropdownRef.current && !measureSubgroupDropdownRef.current.contains(event.target as Node)) {
        setIsMeasureSubgroupDropdownOpen(false);
      }
      if (dimensionDropdownRef.current && !dimensionDropdownRef.current.contains(event.target as Node)) {
        setIsDimensionDropdownOpen(false);
      }
      if (timeGranularityDropdownRef.current && !timeGranularityDropdownRef.current.contains(event.target as Node)) {
        setIsTimeGranularityDropdownOpen(false);
      }
    };

    if (isLayoutDropdownOpen || isMeasureSubgroupDropdownOpen || isDimensionDropdownOpen || isTimeGranularityDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLayoutDropdownOpen, isMeasureSubgroupDropdownOpen, isDimensionDropdownOpen, isTimeGranularityDropdownOpen]);

  const toggleDimensionLevel = (levelId: string) => {
    const newSet = new Set(selectedDimensionLevels);
    if (newSet.has(levelId)) {
      newSet.delete(levelId);
    } else {
      newSet.add(levelId);
    }
    onDimensionLevelsChange(newSet);
  };

  const getSelectedCount = () => {
    return selectedDimensionLevels.size;
  };

  const getTimeGranularitySelectedCount = () => {
    return selectedTimeGranularities.size;
  };

  const toggleTimeGranularity = (granularityId: string) => {
    const newSet = new Set(selectedTimeGranularities);
    if (newSet.has(granularityId)) {
      newSet.delete(granularityId);
    } else {
      newSet.add(granularityId);
    }
    onTimeGranularitiesChange(newSet);
  };

  const getMeasureSubgroupSelectedCount = () => {
    return selectedMeasureSubgroup.size;
  };

  const toggleMeasureSubgroup = (subgroupValue: string) => {
    const newSet = new Set(selectedMeasureSubgroup);
    if (newSet.has(subgroupValue)) {
      newSet.delete(subgroupValue);
    } else {
      newSet.add(subgroupValue);
    }
    setSelectedMeasureSubgroup(newSet);
    if (onMeasureSubgroupChange) {
      onMeasureSubgroupChange(newSet);
    }
  };

  // Calculate total measures available across selected groups
  const totalMeasuresAvailable = useMemo(() => {
    let total = 0;
    const currentIndustry = industry || 'manufacturing';
    
    if (selectedMeasureSubgroup.has('Revenue & Quantity Measures')) {
      const revenueQuantityData = getMockData(currentIndustry);
      total += revenueQuantityData.length;
    }
    
    if (selectedMeasureSubgroup.has('Adjustment Measures')) {
      total += adjustmentMeasuresData.length;
    }
    
    // If no categories selected, default to Revenue & Quantity Measures total
    if (total === 0) {
      const revenueQuantityData = getMockData(currentIndustry);
      total = revenueQuantityData.length;
    }
    
    return total;
  }, [selectedMeasureSubgroup, industry]);

  // Calculate count of measures that would become read-only (measures in Adjustment Measures)
  // Note: Currently unused but kept for potential future use
  // const measuresInBothGroupsCount = useMemo(() => {
  //   if (!selectedMeasureSubgroup.has('Adjustment Measures')) {
  //     return 0;
  //   }
  //   
  //   // Return count of measures that became read-only
  //   // Currently: Final Forecasted Quantity and Final Forecasted Revenue
  //   return 2;
  // }, [selectedMeasureSubgroup]);

  // Get affected measures data for the details modal
  const affectedMeasures = useMemo(() => {
    if (!selectedMeasureSubgroup.has('Adjustment Measures')) {
      return [];
    }
    
    const affected: { name: string; groupName: string }[] = [];
    
    return affected;
  }, [selectedMeasureSubgroup, industry]);

  const getHierarchyGroups = () => {
    const groups: { [key: string]: DimensionLevel[] } = {};
    dimensionLevels.forEach(level => {
      if (!groups[level.hierarchy]) {
        groups[level.hierarchy] = [];
      }
      groups[level.hierarchy].push(level);
    });
    return groups;
  };

  if (!isOpen) return null;

  return (
    <div className="settings-panel">
        {/* Panel Header */}
        <div className="settings-panel-header">
          <div className="settings-panel-title-section">
            <svg className="settings-panel-icon" fill="#0250D9" viewBox="0 0 24 24">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
            <p className="settings-panel-title">Table Settings</p>
          </div>
          <div className="settings-panel-actions">
            <button className="settings-panel-close" onClick={onClose} aria-label="Close">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Panel Body */}
        <div className="settings-panel-body">
          {/* Tabs */}
          <div className="settings-tabs">
            <button
              type="button"
              className={`settings-tab ${activeTab === 'layout' ? 'active' : ''}`}
              onClick={() => setActiveTab('layout')}
            >
              Layout
            </button>
            <button
              type="button"
              className={`settings-tab ${activeTab === 'formatting' ? 'active' : ''}`}
              onClick={() => setActiveTab('formatting')}
            >
              Formatting
            </button>
            <button
              type="button"
              className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              Shortcuts
            </button>
          </div>

          {/* Data Tab */}
          {/* Layout Tab — Measures/Dimensions/Time + Layout settings */}
          {activeTab === 'layout' && (
            <div className="settings-tab-content">

              {/* ── Measures, Dimensions & Time ── */}
              <div className="settings-section" style={{ order: 2 }}>
                <div className="settings-section-header settings-section-header-mdt">
                  <p className="settings-section-title">Measures, Dimensions & Time</p>
                </div>

                <div className="settings-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="settings-field-label" style={{ marginBottom: 0 }}>Measure category</label>
                    <a
                      href="#"
                      className="settings-link"
                      style={{ marginBottom: 0 }}
                      onClick={(e) => { e.preventDefault(); setIsReorderModalOpen(true); }}
                    >
                      Reorder
                    </a>
                  </div>
                  <div className="settings-dropdown-wrapper" ref={measureSubgroupDropdownRef}>
                    <div
                      className={`settings-dropdown-trigger ${isMeasureSubgroupDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsMeasureSubgroupDropdownOpen(!isMeasureSubgroupDropdownOpen)}
                    >
                      <span className={getMeasureSubgroupSelectedCount() > 0 ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}>
                        {getMeasureSubgroupSelectedCount() > 0 ? `${getMeasureSubgroupSelectedCount()} Categor${getMeasureSubgroupSelectedCount() !== 1 ? 'ies' : 'y'} Selected` : 'Select Measure Category'}
                      </span>
                      <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isMeasureSubgroupDropdownOpen && (
                      <div className="settings-dropdown-list settings-dimension-dropdown">
                        {measureSubgroupOptions.map((option, index) => {
                          const isSelected = selectedMeasureSubgroup.has(option.value);
                          return (
                            <div key={index} className="settings-dropdown-checkbox-option" onClick={() => toggleMeasureSubgroup(option.value)}>
                              <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                {isSelected && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <span className="settings-dropdown-checkbox-label">{option.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {measures.length > 0 && (
                    <p className="settings-field-helper-text">
                      Showing {visibleMeasureIds.size === 0 ? measures.length : measures.filter(m => visibleMeasureIds.has(m.id)).length} of {totalMeasuresAvailable} measures
                    </p>
                  )}
                </div>

                <div className="settings-field settings-field-spaced">
                  <label className="settings-field-label">Dimension levels</label>
                  <div className="settings-dropdown-wrapper" ref={dimensionDropdownRef}>
                    <div
                      className={`settings-dropdown-trigger ${isDimensionDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsDimensionDropdownOpen(!isDimensionDropdownOpen)}
                    >
                      <span className={getSelectedCount() > 0 ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}>
                        {getSelectedCount() > 0 ? `${getSelectedCount()} Level${getSelectedCount() !== 1 ? 's' : ''} Selected` : 'Select Dimension Levels'}
                      </span>
                      <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isDimensionDropdownOpen && (
                      <div className="settings-dropdown-list settings-dimension-dropdown">
                        {Object.entries(getHierarchyGroups()).map(([hierarchy, levels]) => (
                          <div key={hierarchy}>
                            <div className="settings-dropdown-header">{hierarchy}</div>
                            {levels.map((level) => {
                              const isSelected = selectedDimensionLevels.has(level.id);
                              const getLevelIcon = () => {
                                if (level.id === 'account') return <img src={AccountIcon} alt="Account" style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }} />;
                                if (level.id === 'category') return <img src={CategoryIcon} alt="Category" style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }} />;
                                if (level.id === 'product') return <img src={ProductIcon} alt="Product" style={{ width: '20px', height: '20px', marginLeft: '12px', marginRight: '4px', flexShrink: 0 }} />;
                                return null;
                              };
                              return (
                                <div key={level.id} className="settings-dropdown-checkbox-option" onClick={() => toggleDimensionLevel(level.id)}>
                                  <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                    {isSelected && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                                  </div>
                                  {getLevelIcon()}
                                  <span className="settings-dropdown-checkbox-label">{level.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="settings-field" style={{ marginTop: '12px' }}>
                  <label className="settings-field-label">Time granularity</label>
                  <div className="settings-dropdown-wrapper" ref={timeGranularityDropdownRef}>
                    <div
                      className={`settings-dropdown-trigger ${isTimeGranularityDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsTimeGranularityDropdownOpen(!isTimeGranularityDropdownOpen)}
                    >
                      <span className={getTimeGranularitySelectedCount() > 0 ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}>
                        {getTimeGranularitySelectedCount() > 0 ? `${getTimeGranularitySelectedCount()} Level${getTimeGranularitySelectedCount() !== 1 ? 's' : ''} Selected` : 'Select Time Granularity'}
                      </span>
                      <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isTimeGranularityDropdownOpen && (
                      <div className="settings-dropdown-list settings-dimension-dropdown">
                        {timeGranularities.map((granularity) => {
                          const isSelected = selectedTimeGranularities.has(granularity.id);
                          return (
                            <div key={granularity.id} className="settings-dropdown-checkbox-option" onClick={() => toggleTimeGranularity(granularity.id)}>
                              <div className={`settings-checkbox-wrapper ${isSelected ? 'checked' : ''}`}>
                                {isSelected && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <span className="settings-dropdown-checkbox-label">{granularity.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Show all Periods Toggle */}
                <div className="settings-field" style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="settings-field-label">Show all periods</label>
                    <button
                      className={`settings-toggle ${showAllPeriods ? 'active' : ''}`}
                      onClick={() => onShowAllPeriodsChange?.(!showAllPeriods)}
                      aria-label="Toggle show all periods"
                    >
                      <div className="settings-toggle-track">
                        <div className="settings-toggle-thumb"></div>
                        {showAllPeriods && (
                          <svg className="settings-toggle-check" fill="none" stroke="white" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Date range */}
                {!showAllPeriods && (
                  <>
                    <div className="settings-field" style={{ marginTop: '12px' }}>
                      <label className="settings-field-label">Start</label>
                      <div className="settings-input-wrapper">
                        <input type="date" className="settings-input settings-date-input" value={startPeriod} onChange={(e) => onStartPeriodChange?.(e.target.value)} />
                      </div>
                    </div>
                    <div className="settings-field" style={{ marginTop: '12px' }}>
                      <label className="settings-field-label">End</label>
                      <div className="settings-input-wrapper">
                        <input type="date" className="settings-input settings-date-input" value={endPeriod} onChange={(e) => onEndPeriodChange?.(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── Layout ── */}
              <div className="settings-section" style={{ order: 1 }}>
                <div className="settings-section-header settings-section-header-layout">
                  <p className="settings-section-title">Layout</p>
                </div>

                {/* Layout dropdown */}
                <div className="settings-field">
                  <label className="settings-field-label">Select layout</label>
                  <div className="settings-dropdown-wrapper" ref={layoutDropdownRef}>
                    <div
                      className={`settings-dropdown-trigger ${isLayoutDropdownOpen ? 'open' : ''}`}
                      onClick={() => setIsLayoutDropdownOpen(!isLayoutDropdownOpen)}
                    >
                      <span className={selectedLayout ? 'settings-dropdown-value' : 'settings-dropdown-placeholder'}>
                        {selectedLayout || 'Select Layout'}
                      </span>
                      <svg className="settings-input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    {isLayoutDropdownOpen && (
                      <div className="settings-dropdown-list">
                        {layoutOptions.map((option, index) => (
                          <div
                            key={index}
                            className={`settings-dropdown-option ${selectedLayout === option.value ? 'selected' : ''}`}
                            onClick={() => { setSelectedLayout(option.value); setIsLayoutDropdownOpen(false); onLayoutChange?.(option.value); }}
                          >
                            <div className="settings-dropdown-option-title">{option.value}</div>
                            <div className="settings-dropdown-option-subtitle">{option.subtitle}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Show row information */}
                <div className="settings-field">
                  <div className="settings-checkbox-row">
                    <label
                      className="settings-standalone-checkbox-label"
                      onClick={() => { const next = !showAdditionalFrozenColumns; setShowAdditionalFrozenColumns(next); onShowAdditionalFrozenColumnsChange?.(next); }}
                    >
                      <div className={`settings-checkbox-wrapper settings-checkbox-wrapper-standalone ${showAdditionalFrozenColumns ? 'checked' : ''}`}>
                        {showAdditionalFrozenColumns && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className="settings-checkbox-text">Show row information</span>
                    </label>
                    <button type="button" className="settings-link-button" onClick={(e) => { e.stopPropagation(); onEditFrozenColumns?.(); }}>Configure</button>
                  </div>
                </div>

                {/* Show sub columns */}
                <div className="settings-field">
                  <div className="settings-checkbox-row">
                    <label
                      className="settings-standalone-checkbox-label"
                      onClick={() => { const next = !showSubColumns; setShowSubColumns(next); onShowSubColumnsChange?.(next); }}
                    >
                      <div className={`settings-checkbox-wrapper settings-checkbox-wrapper-standalone ${showSubColumns ? 'checked' : ''}`}>
                        {showSubColumns && <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className="settings-checkbox-text">Show sub columns</span>
                    </label>
                    <button type="button" className="settings-link-button" onClick={(e) => { e.stopPropagation(); onEditSubColumns?.(); }}>Configure</button>
                  </div>
                </div>

                {/* Column width + reset */}
                <div className="settings-field" style={{ marginTop: '16px' }}>
                  <div className="settings-field-inline-header">
                    <label className="settings-field-label">Column width</label>
                    <button type="button" className="settings-link-button" onClick={handleResetColumnWidth}>Reset</button>
                  </div>
                  <div className="settings-slider-wrapper">
                    <span className="settings-slider-label">1–100</span>
                    <div className="settings-slider-container" ref={sliderRef} onClick={handleSliderClick}>
                      <div className="settings-slider-track">
                        <div className="settings-slider-fill" style={{ width: `${((sliderValue - 1) / 99) * 100}%` }}></div>
                        <div className="settings-slider-thumb" style={{ left: `${((sliderValue - 1) / 99) * 100}%` }} onMouseDown={handleSliderMouseDown}></div>
                      </div>
                    </div>
                    <span className="settings-slider-value">{sliderValue}</span>
                  </div>
                </div>
              </div>


            </div>
          )}

          {/* Formatting Tab */}
          {activeTab === 'formatting' && (
            <div className="settings-tab-content">
              <ConditionalFormattingTab
                rules={conditionalFormattingRules}
                onRulesChange={(rules) => {
                  if (onConditionalFormattingRulesChange) {
                    onConditionalFormattingRulesChange(rules);
                  }
                }}
                onPreviewRuleChange={onConditionalFormattingPreviewChange}
                availableMeasures={measures}
                selectedCellKey={selectedCellKey}
                designSystemRulesEnabled={designSystemRulesEnabled}
                onDesignSystemRulesChange={onDesignSystemRulesChange}
                launchFromSelectionSignal={cfLaunchFromSelectionSignal}
                launchFromSelectionCellKeys={cfLaunchFromSelectionCellKeys}
                applyRulesAsColorScale={applyCfRulesAsColorScale}
                onApplyRulesAsColorScaleChange={onApplyCfRulesAsColorScaleChange}
              />
            </div>
          )}

          {/* Shortcuts Tab */}
          {activeTab === 'shortcuts' && (
            <div className="settings-tab-content">
              <div className="settings-section">
                <div className="settings-section-header">
                  <p className="settings-section-title">Shortcuts</p>
                </div>

                <div className="settings-field">
                  <p className="settings-field-helper-text settings-shortcuts-intro">Use these controls to configure and turn shortcuts on or off.</p>
                </div>

                <div className="settings-field">
                  <div className="settings-checkbox-row">
                    <label
                      className="settings-standalone-checkbox-label"
                      onClick={() => setEnableKeyboardShortcuts(prev => !prev)}
                    >
                      <div className={`settings-checkbox-wrapper settings-checkbox-wrapper-standalone ${enableKeyboardShortcuts ? 'checked' : ''}`}>
                        {enableKeyboardShortcuts && (
                          <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="settings-checkbox-text">Keyboard shortcuts</span>
                    </label>
                    <button
                      type="button"
                      className="settings-link-button"
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      Configure
                    </button>
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-checkbox-row">
                    <label
                      className="settings-standalone-checkbox-label"
                      onClick={() => setEnableRightClickMenuOptions(prev => !prev)}
                    >
                      <div className={`settings-checkbox-wrapper settings-checkbox-wrapper-standalone ${enableRightClickMenuOptions ? 'checked' : ''}`}>
                        {enableRightClickMenuOptions && (
                          <svg className="settings-checkbox-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="settings-checkbox-text">Right click menu options</span>
                    </label>
                    <button
                      type="button"
                      className="settings-link-button"
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      Configure
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      
      {/* Reorder Measures Modal */}
      {measures.length > 0 && (
        <ReorderMeasuresModal
          isOpen={isReorderModalOpen}
          onClose={() => setIsReorderModalOpen(false)}
          measures={measures}
          measureSubgroup={Array.from(selectedMeasureSubgroup).join(', ') || ''}
          selectedMeasureSubgroups={selectedMeasureSubgroup}
          visibleMeasureIds={visibleMeasureIds}
          onSave={(orderedMeasures, visibleMeasureIds) => {
            if (onMeasuresReorder) {
              onMeasuresReorder(orderedMeasures, visibleMeasureIds);
            }
          }}
        />
      )}

      {/* Read-Only Measures Details Modal */}
      <ReadOnlyMeasuresDetailsModal
        isOpen={isReadOnlyDetailsModalOpen}
        onClose={() => setIsReadOnlyDetailsModalOpen(false)}
        affectedMeasures={affectedMeasures}
      />
    </div>
  );
};

export default SettingsPanel;

