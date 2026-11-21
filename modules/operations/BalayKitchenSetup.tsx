import React,{useState} from 'react';
import {defaults} from './schedule';
import {operationsRpc} from './service';
import {manilaDay} from './presentation';
import {buttonClass} from './ui';

export const balayUnit='e61c2c4f-5f69-4e53-a37e-c9d7ecbebe2c';
const presets=[
  {
    "title": "Balay Balay · Kitchen Opening",
    "category": "Opening",
    "kitchen": true,
    "start": "07:00",
    "end": "09:00",
    "items": [
      {
        "snapshot": {
          "title": "Chest Freezer 1 · temperature",
          "instructions": "Select the observed thermometer reading. Choose Other reading for decimals or a value outside the list.",
          "evidence": "numeric",
          "unit": "°C",
          "max": -18
        },
        "rules": {
          "unit": "°C",
          "max": -18
        },
        "required": true,
        "response_type": "numeric"
      },
      {
        "snapshot": {
          "title": "Chest Freezer 2 · temperature",
          "instructions": "Select the observed thermometer reading. Choose Other reading for decimals or a value outside the list.",
          "evidence": "numeric",
          "unit": "°C",
          "max": -18
        },
        "rules": {
          "unit": "°C",
          "max": -18
        },
        "required": true,
        "response_type": "numeric"
      },
      {
        "snapshot": {
          "title": "Chest Freezer 3 · temperature",
          "instructions": "Select the observed thermometer reading. Choose Other reading for decimals or a value outside the list.",
          "evidence": "numeric",
          "unit": "°C",
          "max": -18
        },
        "rules": {
          "unit": "°C",
          "max": -18
        },
        "required": true,
        "response_type": "numeric"
      },
      {
        "snapshot": {
          "title": "Upright Chiller · temperature",
          "instructions": "Select the observed thermometer reading. Choose Other reading for decimals or a value outside the list.",
          "evidence": "numeric",
          "unit": "°C",
          "min": 0,
          "max": 4
        },
        "rules": {
          "unit": "°C",
          "min": 0,
          "max": 4
        },
        "required": true,
        "response_type": "numeric"
      },
      {
        "snapshot": {
          "title": "Three-Door Chiller · temperature",
          "instructions": "Select the observed thermometer reading. Choose Other reading for decimals or a value outside the list.",
          "evidence": "numeric",
          "unit": "°C",
          "min": 0,
          "max": 4
        },
        "rules": {
          "unit": "°C",
          "min": 0,
          "max": 4
        },
        "required": true,
        "response_type": "numeric"
      },
      {
        "snapshot": {
          "title": "S/S Under-Chiller Prep Table · temperature",
          "instructions": "Select the observed thermometer reading. Choose Other reading for decimals or a value outside the list.",
          "evidence": "numeric",
          "unit": "°C",
          "min": 0,
          "max": 4
        },
        "rules": {
          "unit": "°C",
          "min": 0,
          "max": 4
        },
        "required": true,
        "response_type": "numeric"
      },
      {
        "snapshot": {
          "title": "Chiller seals, tracks and sills",
          "instructions": "Inspect chiller door gaskets, tracks, and inner sills to confirm they are clean and free of spills or debris.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Food wrapping, date labels and storage separation",
          "instructions": "Verify all stored food items are tightly wrapped, properly labeled/dated, and separated to prevent cross-contamination (raw items stored strictly below ready-to-eat foods).",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Sanitize prep tables and under-chiller worktop",
          "instructions": "Sanitize S/S Preparation Tables and S/S Under-Chiller Prep Table tops before placing food or equipment on them.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Cookware, knives, boards and tools",
          "instructions": "Confirm all cooking wares, knives, cutting boards, and tools are clean, dry, and properly organized in designated racks/shelves.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Clear shelves of personal belongings",
          "instructions": "Verify zero personal items (bags, footwear, phones) are stored on or under kitchen shelving.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Exhaust hood suction and lighting",
          "instructions": "Turn on Exhaust Hood system and verify proper suction and lighting.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Stove, griller/griddle and fryer readiness",
          "instructions": "Inspect Heavy-Duty 6-Burner Stove, Griller/Griddle, and Deep Fryer to ensure they are clean, dry, and ready for ignition.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Deep fryer oil level and clarity",
          "instructions": "Check Deep Fryer oil level and clarity; filter or top off if needed before heating.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      }
    ]
  },
  {
    "title": "Balay Balay · Opening Stocks & Prep",
    "category": "Opening",
    "kitchen": true,
    "start": "07:00",
    "end": "09:00",
    "items": [
      {
        "snapshot": {
          "title": "Review shift handover log",
          "instructions": "Read Endorsement Log Book to review shift handover notes, pending orders, and carryover prep instructions.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Check freshness of incoming and stored supplies",
          "instructions": "Check freshness and quality of all incoming and stored supplies (produce, meats, seafood, dairy, and dry goods).",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Expiry, spoilage and FIFO rotation",
          "instructions": "Check all chillers, freezers, and dry storage for expiration dates and spoilage; follow FIFO (First-In, First-Out) rotation.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Tell Service/FOH about low stock and unavailable dishes",
          "instructions": "Declare running-low products and out-of-stock (86'd) Ala Carte dishes to Service/FOH team prior to service.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Prepare mise en place",
          "instructions": "Prepare Mise en Place for service according to projected covers and standard recipe specifications.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Record prep waste and trimmings",
          "instructions": "Report and log all wastage and trimmings incurred during food preparation.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      }
    ]
  },
  {
    "title": "Balay Balay · Kitchen Closing & Handover",
    "category": "Closing",
    "kitchen": true,
    "start": "15:00",
    "end": "18:00",
    "items": [
      {
        "snapshot": {
          "title": "6-burner stove, grates and drip trays",
          "instructions": "Heavy-Duty 6-Burner Stove: Remove grates and drip trays; degreaser-wash, rinse, sanitize, and dry. Wipe down burners, knobs, and stainless-steel body.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Griller/griddle and grease traps",
          "instructions": "Griller / Griddle: Scrape off all food debris and carbon buildup; clean surface with griddle brick/cleaner, wipe with food-grade oil to prevent rust, and empty/wash grease traps.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Deep fryer, vat and baskets",
          "instructions": "Deep Fryer: Turn off power/gas. Filter oil (or drain/dispose per schedule), scrub interior vat, rinse thoroughly, dry completely, and wipe down exterior panels and baskets.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Exhaust hood panel",
          "instructions": "Exhaust Hood Panel: Wipe down all interior and exterior stainless-steel hood surfaces with heavy-duty degreaser, then rinse and polish dry.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Exhaust baffle filters",
          "instructions": "Exhaust Filters: Remove baffle filters, soak in degreaser solution, scrub/wash thoroughly (or run through dish machine), air dry completely, and reinstall.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Stainless-steel prep tables",
          "instructions": "S/S Preparation Tables: Clear all items; wash with detergent, rinse, and sanitize tabletops, undershelves, and legs.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Cookware, tools and racks",
          "instructions": "Cooking Wares & Tools: Wash, rinse, sanitize, and air-dry all pots, pans, utensils, wooden boards, and racks. Stack neatly in designated dry storage—never directly on the floor.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Used wiping cloths",
          "instructions": "Discard all used wiping cloths into the designated laundry bin.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Three-door and upright chillers",
          "instructions": "Three-Door Chiller & Upright Chiller: Wipe down exterior doors, handles, and interior shelves. Check that all pans are tightly sealed with fresh plastic wrap and properly dated.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Under-chiller prep table and rails",
          "instructions": "S/S Under-Chiller Prep Table: Empty and clean top condiment rails; scrub and sanitize door gaskets, sliding door tracks, and inner sills.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Chest Freezers 1–3 · lids, seals and frost",
          "instructions": "Chest Freezers: Wipe down exterior lids and gaskets; ensure lids close tightly and check for frost buildup.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Kitchen floor and under-equipment areas",
          "instructions": "Kitchen Floor: Sweep thoroughly, including under all equipment, prep tables, and chillers. Scrub with degreaser floor cleaner, squeegee toward floor drains, and sanitize.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Drain strainers and trash bins",
          "instructions": "Clean and sanitize floor drain strainers and empty all kitchen trash bins (reline with fresh bags).",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Daily grease-trap cleaning",
          "instructions": "Clean the kitchen grease traps daily.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Final gas and electrical shutdown",
          "instructions": "Conduct final visual inspection to ensure all gas valves, fryers, and non-essential electrical equipment are turned off.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Wrap, label and store leftover prep",
          "instructions": "Consolidate, properly label/date, and tightly wrap all leftover mise en place and prepped items for cold storage.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Record next-shift handover",
          "instructions": "Record closing stock status, running-low items, and out-of-stock dishes in the Endorsement Log Book for the next shift.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      }
    ]
  },
  {
    "title": "Balay Balay · Closing Stock Reconciliation",
    "category": "Inventory",
    "kitchen": false,
    "start": "15:00",
    "end": "17:00",
    "items": [
      {
        "snapshot": {
          "title": "Update daily à la carte production inventory",
          "instructions": "Update the Daily Ala Carte Production Inventory Report Form (beginning stock, production, usage/sales, and ending balance).",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Reconcile the waste log",
          "instructions": "Reconcile and log all end-of-day wastage, spoilage, and trimmings in the Waste Log.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      },
      {
        "snapshot": {
          "title": "Prepare next-day stock requisition",
          "instructions": "Prepare necessary stocks requisition based on Approved Par Stock levels for next-day delivery/issuance.",
          "evidence": "yes_no"
        },
        "response_type": "yes_no",
        "required": true
      }
    ]
  }
];

export default function BalayKitchenSetup({titles,onSaved}:{titles:string[];onSaved:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  if(presets.every(p=>titles.includes(p.title)))return null;
  async function publish(){
    setBusy(true);setError('');
    try{
      for(const p of presets.filter(p=>!titles.includes(p.title))){
        const department=p.kitchen?'b3c72314-e55e-498e-aa69-5c6fd9ae7e14':'ee8d5f48-11d3-4dc0-8627-16b09024b749';
        const instructions=(p.category==='Closing'?'Switch off the cooking line and let equipment cool safely before cleaning. ':'')+'Complete on shift. Record exceptions in Remarks. Supervisor or Head Chef to verify.';
        const config={...defaults(),start_date:manilaDay(new Date(Date.now()+86400000)),weekdays:[1,2,3,4,5,6,7],execution:p.kitchen?'shared':'individual',position:p.kitchen?'':'Inventory Officer',department_id:department,department_ids:[department],start_time:p.start,end_time:p.end,due_time:p.end,requires_verification:true,instructions};
        const content={title:p.title,category:p.category,location:'Balay Balay Kitchen',duration:15,evidence:'none',priority:'Normal',frequency:'Daily',review_mode:'Individual Verification',instructions,department_id:department,department_ids:[department],items:p.items,creation:{enabled:true,config}};
        await operationsRpc('ops_save_creation',{p_id:null,p_unit:balayUnit,p_kind:'checklist',p_content:content,p_schedule:config,p_publish:true,p_revision:null,p_rule_revision:null});
      }
    }catch(e){setError((e as Error).message);}finally{await onSaved();setBusy(false);}
  }
  return <div><button type="button" disabled={busy} className={buttonClass} onClick={publish}>{busy?'Publishing…':'Publish Balay Balay daily checklists'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
