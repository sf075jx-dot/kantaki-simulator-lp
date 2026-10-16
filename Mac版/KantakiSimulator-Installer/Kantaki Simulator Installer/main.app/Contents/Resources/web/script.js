let appConfig = {};
let selectedCareLevelId = null;
let selectedBurdenRatioId = null;
let selectedAdditions = {}; // { id: { active: false, count: 1 } }
let selectedOptions = {};   // { id: { distance: 0, times: 0, count: 0 } }
let comparisonList = [];
let uploadedLogoBase64 = null; // 管理画面で新しく選択されたロゴのBase64データ
let isLogoDeleted = false;     // ロゴが削除されたかどうかを管理するフラグ

window.addEventListener('pywebviewready', async function() {
    await loadAppData();
});

async function loadAppData() {
    try {
        appConfig = await window.pywebview.api.get_config();
        
        if (appConfig.burden_ratios && appConfig.burden_ratios.length > 0 && !selectedBurdenRatioId) {
            selectedBurdenRatioId = appConfig.burden_ratios[0].id;
        }

        if (appConfig.additions) {
            appConfig.additions.forEach(add => {
                if (!selectedAdditions[add.id]) {
                    selectedAdditions[add.id] = { active: false, count: add.unit_type === 'days' ? 30 : 1 };
                }
            });
        }

        if (appConfig.options) {
            appConfig.options.forEach(opt => {
                if (!selectedOptions[opt.id]) {
                    selectedOptions[opt.id] = { distance: 0, times: 0, count: 0 };
                }
            });
        }

        initUI();
    } catch (e) {
        console.error("初期設定の取得に失敗しました", e);
    }
}

function toggleAccordion(sectionId, headerEl) {
    const content = document.getElementById(sectionId);
    const icon = headerEl.querySelector('.accordion-icon');
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        icon.classList.remove('closed');
        icon.classList.add('open');
    } else {
        content.classList.add('collapsed');
        icon.classList.remove('open');
        icon.classList.add('closed');
    }
}

function initUI() {
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        const facilityName = appConfig.facility_name || "利用料金シミュレーター";
        headerTitle.innerText = `${facilityName} 利用料金シミュレーション`;
    }

    // ヘッダーロゴの動的反映（常に最新の1つのみ表示）
    const appLogoImg = document.getElementById('app-logo');
    if (appLogoImg) {
        if (appConfig.logo) {
            appLogoImg.src = appConfig.logo;
            appLogoImg.style.display = 'block';
        } else {
            appLogoImg.style.display = 'none';
        }
    }

    const burdenContainer = document.getElementById('burden-ratio-container');
    if (burdenContainer) {
        burdenContainer.innerHTML = '';
        if (appConfig.burden_ratios && appConfig.burden_ratios.length > 0) {
            appConfig.burden_ratios.forEach(br => {
                const isActive = (br.id === selectedBurdenRatioId) ? 'active' : '';
                const btn = document.createElement('div');
                btn.className = `burden-btn ${isActive}`;
                btn.innerText = br.name;
                btn.onclick = () => selectBurdenRatio(br.id);
                burdenContainer.appendChild(btn);
            });
        }
    }

    let currentRate = 0.1;
    if (appConfig.burden_ratios) {
        const foundRatio = appConfig.burden_ratios.find(br => br.id === selectedBurdenRatioId);
        if (foundRatio) {
            currentRate = foundRatio.rate;
        }
    }

    const careContainer = document.getElementById('care-level-container');
    if (careContainer) {
        careContainer.innerHTML = '';
        if (appConfig.care_levels && appConfig.care_levels.length > 0) {
            if (!selectedCareLevelId) {
                selectedCareLevelId = appConfig.care_levels[0].id;
            }

            appConfig.care_levels.forEach(cl => {
                const isActive = (cl.id === selectedCareLevelId) ? 'active' : '';
                const adjustedFee = Math.round(cl.base_fee * currentRate);
                const btn = document.createElement('div');
                btn.className = `care-btn ${isActive}`;
                btn.innerHTML = `<div>${cl.name}</div><div style="font-size:10px; font-weight:normal; margin-top:2px;">¥${adjustedFee.toLocaleString()}</div>`;
                btn.onclick = () => selectCareLevel(cl.id);
                careContainer.appendChild(btn);
            });
        }
    }

    let activeAdditionsCount = 0;
    const additionsContainer = document.getElementById('additions-container');
    if (additionsContainer) {
        additionsContainer.innerHTML = '';
        if (appConfig.additions) {
            appConfig.additions.forEach(add => {
                if (!selectedAdditions[add.id]) {
                    selectedAdditions[add.id] = { active: false, count: 1 };
                }
                const state = selectedAdditions[add.id];
                if (state.active) activeAdditionsCount++;

                const isActive = state.active ? 'active' : '';
                const statusText = state.active ? 'あり' : 'なし';
                
                const unitType = add.unit_type || 'month';
                let priceLabel = '';
                let unitName = '';
                if (unitType === 'days') {
                    priceLabel = `¥${add.unit_price.toLocaleString()} / 日`;
                    unitName = '日';
                } else if (unitType === 'times') {
                    priceLabel = `¥${add.unit_price.toLocaleString()} / 回`;
                    unitName = '回';
                } else if (unitType === 'percent') {
                    priceLabel = `${add.unit_price}% (総額に対して)`;
                } else {
                    priceLabel = `¥${add.unit_price.toLocaleString()} (月額)`;
                }

                const showInput = (unitType !== 'month' && unitType !== 'percent');

                const card = document.createElement('div');
                card.className = `addition-card ${isActive}`;
                card.innerHTML = `
                    <div class="addition-main" onclick="toggleAddition('${add.id}')">
                        <div class="addition-info">
                            <span class="addition-name">${add.name}</span>
                            <span class="addition-price">${priceLabel}</span>
                        </div>
                        <div class="addition-status">${statusText}</div>
                    </div>
                    <div class="addition-count-area ${showInput && state.active ? 'show-count' : ''}">
                        <span>${unitName}数:</span>
                        <input type="number" id="add_count_${add.id}" min="1" value="${state.count}" onclick="event.stopPropagation()" onchange="updateAdditionCount('${add.id}', this.value)">
                        <span>${unitName}</span>
                    </div>
                `;
                additionsContainer.appendChild(card);
            });
        }
    }
    const additionsBadge = document.getElementById('additions-badge');
    if (additionsBadge) additionsBadge.innerText = `選択: ${activeAdditionsCount}件`;

    let activeOptionsCount = 0;
    const optionsContainer = document.getElementById('options-container');
    if (optionsContainer) {
        optionsContainer.innerHTML = '';
        if (appConfig.options) {
            appConfig.options.forEach(opt => {
                if (!selectedOptions[opt.id]) {
                    selectedOptions[opt.id] = { distance: 0, times: 0, count: 0 };
                }
                const optState = selectedOptions[opt.id];
                const unitType = opt.unit_type || 'times';

                let hasValue = false;
                let controlHtml = '';
                let priceSubLabel = '';

                if (unitType === 'distance') {
                    if ((optState.distance > 0) && (optState.times > 0)) hasValue = true;
                    controlHtml = `
                        <div class="option-control" style="gap: 4px; align-items: center;">
                            <input type="number" id="opt_dist_${opt.id}" min="0" step="0.1" value="${optState.distance}" style="width: 55px; padding: 6px; text-align: right; border: 1px solid #b2ebf2; border-radius: 4px;" placeholder="km" oninput="updateOptionDistance('${opt.id}', this.value)">
                            <span style="font-size:11px; color:#78909c;">km ×</span>
                            <input type="number" id="opt_times_${opt.id}" min="0" value="${optState.times}" style="width: 45px; padding: 6px; text-align: right; border: 1px solid #b2ebf2; border-radius: 4px;" placeholder="回" oninput="updateOptionTimes('${opt.id}', this.value)">
                            <span style="font-size:11px; color:#78909c;">回</span>
                        </div>
                    `;
                    priceSubLabel = `¥${opt.unit_price.toLocaleString()} / km・回`;
                } else {
                    if (optState.count > 0) hasValue = true;
                    const unitLabel = '回・日';
                    priceSubLabel = `¥${opt.unit_price.toLocaleString()} / 回・日`;
                    controlHtml = `
                        <div class="option-control">
                            <input type="number" id="opt_${opt.id}" min="0" value="${optState.count}" oninput="updateOptionCount('${opt.id}', this.value)" style="width: 60px; padding: 6px; text-align: right; border: 1px solid #b2ebf2; border-radius: 4px;">
                            <span style="font-size:11px; color:#78909c;">${unitLabel}</span>
                        </div>
                    `;
                }

                if (hasValue) activeOptionsCount++;

                const html = `
                    <div class="option-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f7fcfc; border: 1px solid #b2ebf2; border-radius: 6px;">
                        <div class="option-info">
                            <span class="option-name" style="font-weight: 600; font-size: 13px; color: #00838f; display: block;">${opt.name}</span>
                            <span class="option-price" style="font-size: 11px; color: #78909c;">${priceSubLabel}</span>
                        </div>
                        <div>${controlHtml}</div>
                    </div>
                `;
                optionsContainer.innerHTML += html;
            });
        }
    }
    const optionsBadge = document.getElementById('options-badge');
    if (optionsBadge) optionsBadge.innerText = `選択: ${activeOptionsCount}件`;
}

function updateOptionDistance(id, val) {
    if (!selectedOptions[id]) selectedOptions[id] = { distance: 0, times: 0, count: 0 };
    selectedOptions[id].distance = parseFloat(val) || 0;
    updateOptionsBadge();
}

function updateOptionTimes(id, val) {
    if (!selectedOptions[id]) selectedOptions[id] = { distance: 0, times: 0, count: 0 };
    selectedOptions[id].times = parseInt(val) || 0;
    updateOptionsBadge();
}

function updateOptionCount(id, val) {
    if (!selectedOptions[id]) selectedOptions[id] = { distance: 0, times: 0, count: 0 };
    selectedOptions[id].count = parseInt(val) || 0;
    updateOptionsBadge();
}

function updateOptionsBadge() {
    let count = 0;
    if (appConfig.options) {
        appConfig.options.forEach(opt => {
            const st = selectedOptions[opt.id] || { distance: 0, times: 0, count: 0 };
            const unitType = opt.unit_type || 'times';
            if (unitType === 'distance') {
                if (st.distance > 0 && st.times > 0) count++;
            } else {
                if (st.count > 0) count++;
            }
        });
    }
    const optionsBadge = document.getElementById('options-badge');
    if (optionsBadge) optionsBadge.innerText = `選択: ${count}件`;
}

function selectCareLevel(id) {
    selectedCareLevelId = id;
    initUI();
}

function selectBurdenRatio(id) {
    selectedBurdenRatioId = id;
    initUI();
}

function toggleAddition(id) {
    if (!selectedAdditions[id]) {
        selectedAdditions[id] = { active: false, count: 1 };
    }
    selectedAdditions[id].active = !selectedAdditions[id].active;
    initUI();
}

function updateAdditionCount(id, val) {
    if (selectedAdditions[id]) {
        let count = parseInt(val) || 1;
        if (count < 1) count = 1;
        selectedAdditions[id].count = count;
    }
}

function getCurrentFormData() {
    const additions = {};
    if (appConfig.additions) {
        appConfig.additions.forEach(add => {
            const state = selectedAdditions[add.id] || { active: false, count: 1 };
            const inputCount = document.getElementById(`add_count_${add.id}`);
            const count = inputCount ? parseInt(inputCount.value) || state.count : state.count;
            
            additions[add.id] = {
                active: state.active,
                count: count
            };
        });
    }

    const options = {};
    if (appConfig.options) {
        appConfig.options.forEach(opt => {
            const unitType = opt.unit_type || 'times';
            const st = selectedOptions[opt.id] || { distance: 0, times: 0, count: 0 };
            
            if (unitType === 'distance') {
                const distInput = document.getElementById(`opt_dist_${opt.id}`);
                const timesInput = document.getElementById(`opt_times_${opt.id}`);
                options[opt.id] = {
                    distance: distInput ? parseFloat(distInput.value) || st.distance : st.distance,
                    times: timesInput ? parseInt(timesInput.value) || st.times : st.times
                };
            } else {
                const input = document.getElementById(`opt_${opt.id}`);
                options[opt.id] = {
                    count: input ? parseInt(input.value) || st.count : st.count
                };
            }
        });
    }

    return { 
        care_level_id: selectedCareLevelId, 
        burden_ratio_id: selectedBurdenRatioId,
        additions, 
        options 
    };
}

// -----------------------------------------------------------------
// ★ ローカル完結型計算ロジック（各種加算にも正しく負担割合が適用されます）
// -----------------------------------------------------------------
function calculateFeeLocally(formData) {
    const careLevels = appConfig.care_levels || [];
    const burdenRatios = appConfig.burden_ratios || [];
    const additionsConfig = appConfig.additions || [];
    const optionsConfig = appConfig.options || [];

    const careLevel = careLevels.find(cl => cl.id === formData.care_level_id) || careLevels[0];
    const rawBaseFee = careLevel ? careLevel.base_fee : 0;
    const careName = careLevel ? careLevel.name : "";

    const burdenRatio = burdenRatios.find(br => br.id === formData.burden_ratio_id) || burdenRatios[0];
    const burdenRate = burdenRatio ? burdenRatio.rate : 0.1;
    const burdenName = burdenRatio ? burdenRatio.name : "1割";

    const baseFeeWithBurden = Math.round(rawBaseFee * burdenRate);

    // 管理画面で設定された加算の扱いモードを取得（デフォルトは保険対象）
    const additionMode = appConfig.addition_insurance_mode || 'insurance';
    const isAdditionInsurance = (additionMode === 'insurance');

    const addInputs = formData.additions || {};
    let rawAddTotal = 0;
    const activeAdditionsData = [];
    const rawSelfPayAdditions = []; // 適用外の場合の自費プール

    // 1. まず有効な加算の生金額を計算
    additionsConfig.forEach(add => {
        const addState = addInputs[add.id] || { active: false, count: 1 };
        if (addState.active) {
            const unitType = add.unit_type || 'month';
            const count = parseInt(addState.count) || 1;
            activeAdditionsData.push({ add, unitType, count });

            if (unitType === 'days' || unitType === 'times') {
                rawAddTotal += add.unit_price * count;
            } else if (unitType === 'month') {
                rawAddTotal += add.unit_price;
            }
        }
    });

    // %単位の加算がある場合のベース（基本料金＋固定加算の総額）
    const rawSubtotalForPercentage = rawBaseFee + rawAddTotal;
    let rawAddDetailsTotal = 0;
    const calculatedAdditions = [];

    activeAdditionsData.forEach(item => {
        const add = item.add;
        const unitType = item.unitType;
        const count = item.count;
        let subtotalRaw = 0;
        let detailName = add.name;

        if (unitType === 'percent') {
            const percentage = add.unit_price;
            subtotalRaw = Math.round(rawSubtotalForPercentage * (percentage / 100.0));
            detailName += ` (${percentage}%)`;
        } else if (unitType === 'days') {
            subtotalRaw = add.unit_price * count;
            detailName += ` (${count}日分)`;
        } else if (unitType === 'times') {
            subtotalRaw = add.unit_price * count;
            detailName += ` (${count}回)`;
        } else {
            subtotalRaw = add.unit_price;
            detailName += ` (月額)`;
        }

        rawAddDetailsTotal += subtotalRaw;
        calculatedAdditions.push({ name: detailName, rawSubtotal: subtotalRaw });
    });

    const addDetails = [];
    let insuranceAddTotalRaw = 0;
    let selfPayAddTotalRaw = 0;

    // 一括設定モードによる分岐処理
    calculatedAdditions.forEach(item => {
        if (isAdditionInsurance) {
            // 【パターンA】加算も介護保険対象（負担割合をかける）
            insuranceAddTotalRaw += item.rawSubtotal;
            addDetails.push({
                name: item.name,
                subtotal: Math.round(item.rawSubtotal * burdenRate)
            });
        } else {
            // 【パターンB】加算はすべて適用外・全額自費（100%自己負担）
            selfPayAddTotalRaw += item.rawSubtotal;
            rawSelfPayAdditions.push({
                name: `${item.name} (自費)`,
                subtotal: item.rawSubtotal
            });
        }
    });

    // 保険対象の総額（基本料金 ＋ 保険対象加算）に対して負担割合をかける
    const totalInsuranceRaw = rawBaseFee + insuranceAddTotalRaw;
    const totalInsuranceCopay = Math.round(totalInsuranceRaw * burdenRate);

    // 2. オプションおよび自費扱いの加算の集計
    let optionsTotal = 0;
    const optionsDetail = [];

    // 適用外になった加算分を自費明細に合流
    rawSelfPayAdditions.forEach(item => {
        optionsTotal += item.subtotal;
        optionsDetail.push(item);
    });

    // 通常のオプション項目
    const optInputs = formData.options || {};
    optionsConfig.forEach(opt => {
        const optState = optInputs[opt.id] || { distance: 0, times: 0, count: 0 };
        const unitType = opt.unit_type || 'times';

        if (unitType === 'distance') {
            const distanceVal = parseFloat(optState.distance) || 0;
            const timesVal = parseInt(optState.times) || 0;
            if (distanceVal > 0 && timesVal > 0) {
                const subtotal = Math.round(opt.unit_price * distanceVal * timesVal);
                optionsTotal += subtotal;
                optionsDetail.push({ name: `${opt.name} (${distanceVal}km × ${timesVal}回)`, subtotal });
            }
        } else {
            const count = parseInt(optState.count) || 0;
            if (count > 0) {
                const subtotal = opt.unit_price * count;
                optionsTotal += subtotal;
                optionsDetail.push({ name: `${opt.name} (${count}回)`, subtotal });
            }
        }
    });

    // 3. 最終合計
    const total = totalInsuranceCopay + optionsTotal;

    return {
        facility_name: appConfig.facility_name || "",
        care_name: careName,
        burden_name: burdenName,
        raw_base_fee: rawBaseFee,
        base_fee: baseFeeWithBurden,
        add_details: addDetails,
        options_detail: optionsDetail,
        options_total: optionsTotal,
        total: total
    };
}

async function addComparison() {
    const formData = getCurrentFormData();
    if (!formData.care_level_id) {
        alert('介護度を選択してください。');
        return;
    }

    if (comparisonList.length >= 3) {
        alert('比較できるのは最大3つまでです。不要なカードを削除してください。');
        return;
    }

    try {
        // Python経由ではなく、JS側でローカル計算を実行
        const result = calculateFeeLocally(formData);
        comparisonList.push({
            id: Date.now(),
            data: formData,
            result: result
        });
        renderComparisonCards();
    } catch (e) {
        console.error("計算処理に失敗しました", e);
    }
}

function removeCard(id) {
    comparisonList = comparisonList.filter(item => item.id !== id);
    renderComparisonCards();
}

function renderComparisonCards() {
    const container = document.getElementById('comparison-cards');
    if (!container) return;

    if (comparisonList.length === 0) {
        container.innerHTML = `<div class="empty-state">左側の条件を設定し、「比較に追加する」を押してください。</div>`;
        return;
    }

    container.innerHTML = '';
    comparisonList.forEach((item, index) => {
        const res = item.result;
        
        let addHtml = '';
        if (res.add_details) {
            res.add_details.forEach(a => {
                addHtml += `<tr><td>${a.name}</td><td>¥${a.subtotal.toLocaleString()}</td></tr>`;
            });
        }

        let optionsHtml = '';
        if (res.options_detail) {
            res.options_detail.forEach(opt => {
                optionsHtml += `<tr><td>${opt.name}</td><td>¥${opt.subtotal.toLocaleString()}</td></tr>`;
            });
        }

        const cardHtml = `
            <div class="simulation-card" id="card-${item.id}">
                <div class="card-header">
                    <span class="card-title">プラン ${index + 1} (${res.care_name} / ${res.burden_name})</span>
                    <button class="delete-btn" onclick="removeCard(${item.id})" title="削除">×</button>
                </div>
                <table class="summary-table">
                    <tr>
                        <td>基本月額料金 (${res.care_name} / ${res.burden_name}負担)<br><span style="font-size:10px; color:#78909c;">(総額 ¥${res.raw_base_fee.toLocaleString()} の ${res.burden_name})</span></td>
                        <td>¥${res.base_fee.toLocaleString()}</td>
                    </tr>
                    ${addHtml}
                    ${optionsHtml}
                </table>
                <div class="total-box">
                    <div class="total-label">月額シミュレーション合計（税込目安）</div>
                    <div class="total-amount">¥${res.total.toLocaleString()}</div>
                </div>
                <button class="btn btn-print" onclick="printCard(${item.id})">この結果をPDF出力（保存）</button>
            </div>
        `;
        container.innerHTML += cardHtml;
    });
}

function printCard(id) {
    const targetCard = document.getElementById(`card-${id}`);
    if (!targetCard) return;

    const facilityName = appConfig.facility_name || '看護小規模多機能居宅介護';
    
    const logoHtml = appConfig.logo 
        ? `<img src="${appConfig.logo}" alt="ロゴ" style="height: 26px; margin-right: 12px; object-fit: contain;" onerror="this.style.display='none';">` 
        : '';

    const printHeader = document.createElement('div');
    printHeader.className = 'dynamic-print-header';
    printHeader.style.cssText = 'display: flex; align-items: center; margin-bottom: 12px; border-bottom: 2px solid #00acc1; padding-bottom: 8px;';
    printHeader.innerHTML = `
        ${logoHtml}
        <span style="font-size: 14px; font-weight: bold; color: #37474f;">${facilityName} 利用料金シミュレーション</span>
    `;

    const printSeal = document.createElement('div');
    printSeal.className = 'dynamic-print-seal';
    printSeal.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; margin-top: 15px; margin-bottom: 10px; page-break-inside: avoid;';
    printSeal.innerHTML = `
        <div style="box-sizing: border-box; border: 1px solid #37474f; width: 65px; background: #f5f5f5; padding: 2px 0; text-align: center; font-size: 10px; font-weight: bold;">担当者</div>
        <div style="box-sizing: border-box; border: 1px solid #37474f; border-top: none; width: 65px; height: 45px;"></div>
    `;

    targetCard.insertBefore(printHeader, targetCard.firstChild);
    targetCard.appendChild(printSeal);
    targetCard.classList.add('printing');

    const allCards = document.querySelectorAll('.simulation-card');
    allCards.forEach(card => {
        if (card.id !== `card-${id}`) {
            card.style.display = 'none';
        }
    });

    window.print();

    allCards.forEach(card => {
        if (card.id !== `card-${id}`) {
            card.style.display = '';
        }
    });

    targetCard.classList.remove('printing');
    printHeader.remove();
    printSeal.remove();
}

function resetForm() {
    if (appConfig.care_levels && appConfig.care_levels.length > 0) {
        selectedCareLevelId = appConfig.care_levels[0].id;
    }
    if (appConfig.burden_ratios && appConfig.burden_ratios.length > 0) {
        selectedBurdenRatioId = appConfig.burden_ratios[0].id;
    }
    selectedAdditions = {};
    if (appConfig.additions) {
        appConfig.additions.forEach(add => {
            selectedAdditions[add.id] = { active: false, count: add.unit_type === 'days' ? 30 : 1 };
        });
    }
    selectedOptions = {};
    if (appConfig.options) {
        appConfig.options.forEach(opt => {
            selectedOptions[opt.id] = { distance: 0, times: 0, count: 0 };
        });
    }
    initUI();
}

/* --- 管理モード・認証ロジック --- */
function openAdminAuth() {
    document.getElementById('admin-pass-input').value = '';
    document.getElementById('auth-modal').style.display = 'flex';
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function verifyAdmin() {
    const pass = document.getElementById('admin-pass-input').value;
    const correctPass = appConfig.admin_password || "admin";
    if (pass === correctPass) {
        closeAuthModal();
        openConfigModal();
    } else {
        alert('パスワードが違います。');
    }
}

function openConfigModal() {
    document.getElementById('edit-facility-name').value = appConfig.facility_name || '';
    
    // パスワード入力欄はセキュリティと混乱防止のため空欄にしておく（または current をセットしない仕様）
    const passInput = document.getElementById('edit-admin-password');
    if (passInput) passInput.value = '';

    // 加算の一括保険適用モードの状態を反映
    const modeSelect = document.getElementById('edit-addition-mode');
    if (modeSelect) {
        modeSelect.value = appConfig.addition_insurance_mode || 'insurance';
    }

    uploadedLogoBase64 = null;
    isLogoDeleted = false;
    const logoPreview = document.getElementById('edit-logo-preview');
    const logoFileInput = document.getElementById('edit-logo-file');
    if (logoFileInput) logoFileInput.value = '';

    if (logoPreview) {
        if (appConfig.logo) {
            logoPreview.src = appConfig.logo;
            logoPreview.style.display = 'block';
        } else {
            logoPreview.src = '';
            logoPreview.style.display = 'none';
        }
    }

    const burdenContainer = document.getElementById('edit-burden-ratios-container');
    burdenContainer.innerHTML = '';
    if (appConfig.burden_ratios) {
        appConfig.burden_ratios.forEach((br) => {
            burdenContainer.innerHTML += `
                <div class="edit-row br-row" data-id="${br.id}">
                    <span style="text-align:center; color:#b0bec5;">-</span>
                    <input type="text" class="br-name" value="${br.name}">
                    <input type="number" step="0.05" class="br-rate" value="${br.rate}">
                    <span>割合(例:0.1)</span>
                    <span></span>
                </div>
            `;
        });
    }

    const careContainer = document.getElementById('edit-care-levels-container');
    careContainer.innerHTML = '';
    if (appConfig.care_levels) {
        appConfig.care_levels.forEach((cl) => {
            careContainer.innerHTML += `
                <div class="edit-row cl-row" data-id="${cl.id}">
                    <span style="text-align:center; color:#b0bec5;">-</span>
                    <input type="text" class="cl-name" value="${cl.name}">
                    <input type="number" class="cl-fee" value="${cl.base_fee}">
                    <span></span><span></span>
                </div>
            `;
        });
    }

    renderEditAdditions();
    renderEditOptions();
    
    document.getElementById('config-modal').style.display = 'flex';
}

function previewLogoFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedLogoBase64 = e.target.result;
        isLogoDeleted = false;
        const preview = document.getElementById('edit-logo-preview');
        if (preview) {
            preview.src = uploadedLogoBase64;
            preview.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}

function removeLogo() {
    uploadedLogoBase64 = null;
    isLogoDeleted = true;
    
    const logoFileInput = document.getElementById('edit-logo-file');
    if (logoFileInput) logoFileInput.value = '';

    const preview = document.getElementById('edit-logo-preview');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
}

function renderEditAdditions() {
    const addContainer = document.getElementById('edit-additions-container');
    addContainer.innerHTML = '';
    if (appConfig.additions) {
        appConfig.additions.forEach((add) => {
            addContainer.appendChild(createSortableRow('add', add.id, add.name, add.unit_price, add.unit_type || 'month'));
        });
    }
}

function addAdditionRow() {
    const addContainer = document.getElementById('edit-additions-container');
    const newId = 'add_' + Date.now();
    addContainer.appendChild(createSortableRow('add', newId, '', 0, 'month'));
}

function addAdditionRow() {
    const addContainer = document.getElementById('edit-additions-container');
    const newId = 'add_' + Date.now();
    addContainer.appendChild(createSortableRow('add', newId, '', 0, 'month'));
}

function renderEditOptions() {
    const optContainer = document.getElementById('edit-options-container');
    optContainer.innerHTML = '';
    if (appConfig.options) {
        appConfig.options.forEach((opt) => {
            optContainer.appendChild(createSortableRow('opt', opt.id, opt.name, opt.unit_price, opt.unit_type || 'times'));
        });
    }
}

function addOptionRow() {
    const optContainer = document.getElementById('edit-options-container');
    const newId = 'opt_' + Date.now();
    optContainer.appendChild(createSortableRow('opt', newId, '', 0, 'times'));
}

function createSortableRow(type, id, name, price, unitType) {
    const row = document.createElement('div');
    row.className = `edit-row ${type}-row`;
    row.setAttribute('data-id', id);

    let unitSelectHtml = '';
    if (type === 'add') {
        unitSelectHtml = `
            <select class="add-unit-type">
                <option value="month" ${unitType === 'month' ? 'selected' : ''}>月額固定</option>
                <option value="days" ${unitType === 'days' ? 'selected' : ''}>日単位 (/日)</option>
                <option value="times" ${unitType === 'times' ? 'selected' : ''}>回単位 (/回)</option>
                <option value="percent" ${unitType === 'percent' ? 'selected' : ''}>％単位 (％)</option>
            </select>
        `;
    } else {
        unitSelectHtml = `
            <select class="opt-unit-type">
                <option value="times" ${unitType === 'times' ? 'selected' : ''}>回・日単位 (/回)</option>
                <option value="distance" ${unitType === 'distance' ? 'selected' : ''}>距離単位 (/km×回)</option>
            </select>
        `;
    }

    row.innerHTML = `
        <div class="drag-handle" title="ここをドラッグして並び替え">☰</div>
        <input type="text" class="${type}-name" value="${name}" placeholder="項目名">
        <input type="number" step="any" class="${type}-price" value="${price}" placeholder="単価/％">
        ${unitSelectHtml}
        <button class="delete-row-btn" onclick="this.parentElement.remove()">×</button>
    `;

    const handle = row.querySelector('.drag-handle');
    handle.addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));
    handle.addEventListener('mouseup', () => row.setAttribute('draggable', 'false'));

    row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        row.setAttribute('draggable', 'false');
    });

    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        const container = row.parentNode;
        const draggingRow = container.querySelector('.dragging');
        if (!draggingRow || draggingRow === row) return;

        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        if (e.clientY < midpoint) {
            container.insertBefore(draggingRow, row);
        } else {
            container.insertBefore(draggingRow, row.nextSibling);
        }
    });

    return row;
}

function closeConfigModal() {
    document.getElementById('config-modal').style.display = 'none';
}

async function saveNewConfig() {
    const newConfig = { ...appConfig };
    newConfig.facility_name = document.getElementById('edit-facility-name').value;

    // 管理者パスワードの更新処理（入力がある場合のみ上書き、空欄なら既存を維持）
    const passInput = document.getElementById('edit-admin-password');
    if (passInput && passInput.value.trim() !== '') {
        newConfig.admin_password = passInput.value.trim();
    } else if (!newConfig.admin_password) {
        newConfig.admin_password = "admin"; // デフォルト値のフォールバック
    }

    // 加算項目の計算扱い（一括設定）の保存
    const modeSelect = document.getElementById('edit-addition-mode');
    newConfig.addition_insurance_mode = modeSelect ? modeSelect.value : 'insurance';

    if (isLogoDeleted) {
        newConfig.logo = "";
    } else if (uploadedLogoBase64 !== null) {
        newConfig.logo = uploadedLogoBase64;
    }

    const brRows = document.querySelectorAll('#edit-burden-ratios-container .br-row');
    const newBurdenRatios = [];
    brRows.forEach(row => {
        const id = row.getAttribute('data-id') || ('ratio_' + Date.now());
        const name = row.querySelector('.br-name').value;
        const rate = parseFloat(row.querySelector('.br-rate').value) || 0.1;
        if (name) {
            newBurdenRatios.push({ id, name, rate });
        }
    });
    newConfig.burden_ratios = newBurdenRatios;

    const clRows = document.querySelectorAll('#edit-care-levels-container .cl-row');
    const newCareLevels = [];
    clRows.forEach(row => {
        const id = row.getAttribute('data-id') || ('level_' + Date.now());
        const name = row.querySelector('.cl-name').value;
        const base_fee = parseInt(row.querySelector('.cl-fee').value) || 0;
        if (name) {
            newCareLevels.push({ id, name, base_fee });
        }
    });
    newConfig.care_levels = newCareLevels;

    const addRows = document.querySelectorAll('#edit-additions-container .add-row');
    const newAdditions = [];
    addRows.forEach(row => {
        const id = row.getAttribute('data-id') || ('add_' + Date.now());
        const name = row.querySelector('.add-name').value;
        const unit_price = parseFloat(row.querySelector('.add-price').value) || 0;
        const unitSelect = row.querySelector('.add-unit-type');
        const unit_type = unitSelect ? unitSelect.value : 'month';
        if (name) {
            newAdditions.push({ id, name, unit_price, unit_type });
        }
    });
    newConfig.additions = newAdditions;

    const optRows = document.querySelectorAll('#edit-options-container .opt-row');
    const newOptions = [];
    optRows.forEach(row => {
        const id = row.getAttribute('data-id') || ('opt_' + Date.now());
        const name = row.querySelector('.opt-name').value;
        const unit_price = parseFloat(row.querySelector('.opt-price').value) || 0;
        const unitSelect = row.querySelector('.opt-unit-type');
        const unit_type = unitSelect ? unitSelect.value : 'times';
        if (name) {
            newOptions.push({ id, name, unit_price, unit_type });
        }
    });
    newConfig.options = newOptions;

    const res = await window.pywebview.api.update_config(newConfig);
    if (res.success) {
        alert(res.message);
        closeConfigModal();
        uploadedLogoBase64 = null;
        isLogoDeleted = false;
        await loadAppData();
    } else {
        alert('保存に失敗しました: ' + res.message);
    }
}