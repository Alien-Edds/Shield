// packs/BP/scripts/main.ts
import { ButtonState, EntityDamageCause, EntityEquippableComponent, EntityOnFireComponent, EquipmentSlot, GameMode, InputButton, ItemCooldownComponent, ItemDurabilityComponent, ItemEnchantableComponent, Player, system, world } from "@minecraft/server";
var Shields = {
  // "custom_shield:custom_shield": (data) => {
  //     world.sendMessage("this is a script")
  // }
};
var delays = {};
var usingItem = {};
var cooldownUntil = {};
var recentlyBlocked = {};
var playerAnimations = {};
var cancelledEffects = {};
function getHeldShield(player, withCooldown = true) {
  function isValidShield(item2) {
    if (!item2.hasComponent("custom_shield:shield")) return false;
    if (withCooldown && (cooldownUntil[player.id] ?? 0) > system.currentTick) return false;
    return true;
  }
  const equippable = player.getComponent(EntityEquippableComponent.componentId);
  if (!equippable) return void 0;
  const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
  const offItem = offhand.getItem();
  if (offItem && isValidShield(offItem)) return { item: offItem, slot: offhand, hand: "off_hand" };
  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const item = mainhand.getItem();
  if (item && isValidShield(item)) return { item, slot: mainhand, hand: "main_hand" };
  return void 0;
}
function runDelay(player, delay) {
  if (delays[player.id]) system.clearRun(delays[player.id]);
  const playerId = player.id;
  const id = system.runTimeout(() => {
    delete delays[playerId];
  }, delay * 20);
  delays[playerId] = id;
}
function stopBlockAnimation(player) {
  const anim = playerAnimations[player.id];
  if (anim) {
    player.playAnimation(anim, { blendOutTime: 0, stopExpression: "return true;" });
    delete playerAnimations[player.id];
  }
}
function startBlockAnimation(player, hand) {
  const animName = `animation.custom_shield.player.shield_block_${hand}`;
  if (playerAnimations[player.id] !== animName) {
    stopBlockAnimation(player);
    player.playAnimation(animName, { blendOutTime: 99999, stopExpression: "q.is_sneaking" });
    playerAnimations[player.id] = animName;
  }
}
world.afterEvents.playerButtonInput.subscribe((data) => {
  if (data.button !== InputButton.Sneak) return;
  const player = data.player;
  if (data.newButtonState === ButtonState.Pressed) {
    const shield = getHeldShield(player);
    const delay = shield?.item.getComponent("custom_shield:shield")?.customComponentParameters.params?.delay;
    if (delay !== void 0) runDelay(player, delay);
    if (shield && !usingItem[player.id]) {
      startBlockAnimation(player, shield.hand);
    }
  } else {
    stopBlockAnimation(player);
    if (delays[player.id]) system.clearRun(delays[player.id]);
    delete delays[player.id];
  }
});
world.afterEvents.playerSwingStart.subscribe((data) => {
  if (!data.player.isSneaking) return;
  const player = data.player;
  const shield = getHeldShield(player);
  const delay = shield?.item.getComponent("custom_shield:shield")?.customComponentParameters.params?.delay;
  if (delay !== void 0) {
    runDelay(player, delay);
  }
});
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((data) => {
  const player = data.player;
  if (!playerAnimations[player.id]) return;
  if (!getHeldShield(player, false)) stopBlockAnimation(player);
});
world.beforeEvents.entityHurt.subscribe((data) => {
  if (!(data.hurtEntity instanceof Player)) return;
  const player = data.hurtEntity;
  const cause = data.damageSource.cause;
  const currentTick = system.currentTick;
  if (cause === EntityDamageCause.fireTick || cause === EntityDamageCause.fire || cause === EntityDamageCause.onFire) {
    if (recentlyBlocked[player.id] !== void 0 && currentTick - recentlyBlocked[player.id] < 40) {
      data.cancel = true;
    }
    return;
  }
  let preDamageValue = data.damage;
  const equip = player.getComponent(EntityEquippableComponent.componentId);
  if (equip) {
    let totalProtection = 0;
    let totalArmor = 0;
    for (const equipSlot in EquipmentSlot) {
      if (equipSlot.includes("hand")) continue;
      const slot = equip.getEquipmentSlot(EquipmentSlot[equipSlot]);
      const item = slot.getItem();
      if (item) {
        const ench = item.getComponent(ItemEnchantableComponent.componentId);
        const prot = ench?.getEnchantment("protection");
        const proj = ench?.getEnchantment("projectile_protection");
        if (prot) totalProtection += prot.level;
        if (proj && cause === EntityDamageCause.projectile) totalProtection += proj.level;
        if (ARMOR_VALUES[item.typeId]) totalArmor += ARMOR_VALUES[item.typeId];
      }
    }
    if (totalArmor) preDamageValue = preDamageValue / (1 - totalArmor * 0.03875);
    if (totalProtection) preDamageValue = preDamageValue / (1 - totalProtection * 0.03875);
  }
  if (!player.isSneaking || delays[player.id] !== void 0 || usingItem[player.id]) return;
  const shield = getHeldShield(player);
  if (!shield) return;
  const playerLoc = player.location;
  const viewDir = player.getViewDirection();
  const viewDirLoc = {
    x: playerLoc.x + viewDir.x * 0.01,
    y: playerLoc.y,
    z: playerLoc.z + viewDir.z * 0.01
  };
  const damageLocation = data.damageSource.damagingEntity?.location ?? data.damageSource.damagingProjectile?.location;
  if (!damageLocation) return;
  const pTotal = Math.abs(playerLoc.x - damageLocation.x) + Math.abs(playerLoc.y - damageLocation.y) + Math.abs(playerLoc.z - damageLocation.z);
  const vTotal = Math.abs(viewDirLoc.x - damageLocation.x) + Math.abs(viewDirLoc.y - damageLocation.y) + Math.abs(viewDirLoc.z - damageLocation.z);
  if (pTotal < vTotal) return;
  let disableShield = false;
  if (data.damageSource.damagingEntity) {
    const disableConditions = [
      data.damageSource.damagingEntity.typeId === "minecraft:vindicator",
      data.damageSource.damagingEntity.typeId === "minecraft:piglin_brute",
      data.damageSource.damagingEntity.typeId === "minecraft:warden" && cause === EntityDamageCause.entityAttack
    ];
    if (disableConditions.find((f) => f == true)) {
      disableShield = true;
    } else {
      const equippable = data.damageSource.damagingEntity.getComponent(EntityEquippableComponent.componentId);
      if (equippable?.getEquipmentSlot(EquipmentSlot.Mainhand).getItem()?.hasTag("minecraft:is_axe")) disableShield = true;
    }
  }
  const hadFire = player.getComponent(EntityOnFireComponent.componentId) !== void 0;
  cancelledEffects[player.id] = true;
  recentlyBlocked[player.id] = currentTick;
  const id = player.id;
  system.run(() => {
    delete cancelledEffects[id];
    const heldShield = getHeldShield(player);
    if (!heldShield) return;
    if (data.damageSource.damagingEntity?.typeId === "minecraft:ravager" && cause === EntityDamageCause.entityAttack) data.damageSource.damagingEntity.triggerEvent("minecraft:become_stunned");
    if (!hadFire && player.getComponent(EntityOnFireComponent.componentId)) player.extinguishFire();
    if (Shields[heldShield.item.typeId]) Shields[heldShield.item.typeId]({ event: data, item: heldShield.item, source: player, slot: heldShield.slot });
    if (heldShield.item.hasComponent(ItemDurabilityComponent.componentId)) {
      let damage = preDamageValue;
      if (damage > Math.floor(damage)) damage = Math.floor(damage);
      damage += 1;
      heldShield.slot.setItem(reduceDurability(player, heldShield.item, damage));
    }
    const comp = heldShield.item.getComponent("custom_shield:shield")?.customComponentParameters.params;
    if (comp.knockback && data.damageSource.damagingEntity && !data.damageSource.damagingProjectile) {
      const total = Math.abs(damageLocation.x - playerLoc.x) + Math.abs(damageLocation.z - playerLoc.z);
      try {
        data.damageSource.damagingEntity.applyKnockback({ x: (damageLocation.x - playerLoc.x) / total * (comp.knockback.x ?? 0), z: (damageLocation.z - playerLoc.z) / total * (comp.knockback.x ?? 0) }, comp.knockback.y ?? 0.1);
      } catch {
      }
    }
    const cooldown = heldShield.item.getComponent(ItemCooldownComponent.componentId);
    if (comp.block) player.dimension.playSound(comp.block, player.location);
    if (comp.command) player.runCommand(comp.command);
    if (cooldown !== void 0 && disableShield) {
      cooldown.startCooldown(player);
      cooldownUntil[id] = system.currentTick + (cooldown.cooldownTicks ?? 100);
      if (comp.disable_sound) player.dimension.playSound(comp.disable_sound, player.location);
    }
  });
  data.cancel = true;
});
world.beforeEvents.effectAdd.subscribe((data) => {
  if (!cancelledEffects[data.entity.id]) return;
  data.cancel = true;
});
system.beforeEvents.startup.subscribe((data) => {
  data.itemComponentRegistry.registerCustomComponent("custom_shield:shield", {});
});
function reduceDurability(player, item, damage) {
  if (player.getGameMode() === GameMode.Creative) return item;
  const durComp = item.getComponent(ItemDurabilityComponent.componentId);
  if (!durComp) return item;
  const enchComp = item.getComponent(ItemEnchantableComponent.componentId);
  const unbreaking = enchComp?.getEnchantment("unbreaking");
  if (unbreaking !== void 0) {
    const chance = 100 / (unbreaking.level + 1);
    const random = Math.random() * 100;
    if (random >= 100 - chance) {
      if (durComp.damage + damage > durComp.maxDurability) {
        player.dimension.playSound("random.break", player.location);
        return void 0;
      } else {
        durComp.damage += damage;
        return item;
      }
    }
    return item;
  }
  if (durComp.damage + damage > durComp.maxDurability) {
    player.dimension.playSound("random.break", player.location);
    return void 0;
  } else {
    durComp.damage += damage;
    return item;
  }
}
world.afterEvents.playerLeave.subscribe((data) => {
  delete playerAnimations[data.playerId];
  delete usingItem[data.playerId];
  if (delays[data.playerId]) system.clearRun(delays[data.playerId]);
  delete delays[data.playerId];
  delete cooldownUntil[data.playerId];
  delete recentlyBlocked[data.playerId];
});
world.afterEvents.itemStartUse.subscribe((data) => {
  usingItem[data.source.id] = true;
});
world.afterEvents.itemStopUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
world.afterEvents.itemReleaseUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
var ARMOR_VALUES = {
  /**
   * HELMETS
   */
  "minecraft:leather_helmet": 1,
  "minecraft:copper_helmet": 2,
  "minecraft:golden_helmet": 2,
  "minecraft:chainmail_helmet": 2,
  "minecraft:iron_helmet": 2,
  "minecraft:turtle_helmet": 2,
  "minecraft:diamond_helmet": 3,
  "minecraft:netherite_helmet": 3,
  /**
   * CHESTPLATES
   */
  "minecraft:leather_chestplate": 3,
  "minecraft:copper_chestplate": 4,
  "minecraft:golden_chestplate": 5,
  "minecraft:chainmail_chestplate": 5,
  "minecraft:iron_chestplate": 6,
  "minecraft:diamond_chestplate": 8,
  "minecraft:netherite_chestplate": 8,
  /**
   * LEGGINGS
   */
  "minecraft:leather_leggings": 2,
  "minecraft:copper_leggings": 3,
  "minecraft:golden_leggings": 3,
  "minecraft:chainmail_leggings": 4,
  "minecraft:iron_leggings": 5,
  "minecraft:diamond_leggings": 6,
  "minecraft:netherite_leggings": 6,
  /**
   * BOOTS
   */
  "minecraft:leather_boots": 1,
  "minecraft:copper_boots": 1,
  "minecraft:golden_boots": 1,
  "minecraft:chainmail_boots": 1,
  "minecraft:iron_boots": 2,
  "minecraft:diamond_boots": 3,
  "minecraft:netherite_boots": 3
};
export {
  ARMOR_VALUES,
  reduceDurability
};
